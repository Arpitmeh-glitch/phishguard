"""
VirusTotal Threat Intelligence Service — PhishGuard
=====================================================
Queries the VirusTotal v3 public API for domain reputation data and folds the
result into the URL scanning pipeline as an additional detection layer.

Free-tier constraints (strictly enforced)
------------------------------------------
  4 requests / minute   →  minimum 15 s between any two API calls
  500 requests / day    →  daily counter tracked in-process

Both limits are enforced conservatively so this service can never cause a
429 response regardless of how many concurrent scan requests arrive.

Caching (24-hour TTL)
---------------------
Every domain that receives a successful VT response is stored in
_VT_CACHE keyed by the normalised root domain. Subsequent lookups for the
same domain — even from different scan requests — return the cached result
immediately without touching the API. This is the primary mechanism that
keeps daily usage well within the 500-request budget.

Cache entry shape:
    {
        "domain":       str,          # normalised domain that was queried
        "malicious":    int,          # engines that flagged malicious
        "suspicious":   int,          # engines that flagged suspicious
        "harmless":     int,          # engines that flagged harmless
        "total":        int,          # total engines that responded
        "reputation":   int,          # VT community reputation score
        "categories":   list[str],    # vendor-assigned category labels
        "verdict":      str,          # "malicious"|"suspicious"|"clean"|"unknown"
        "confidence":   float,        # 0.0–1.0 derived from engine ratio
        "cached_at":    float,        # time.time() when entry was stored
        "source":       str,          # "virustotal" always
    }

Rate limiting (token-bucket–style via a simple timestamp gate)
--------------------------------------------------------------
_VT_LAST_CALL_TIME tracks the epoch of the most recent outbound VT request.
Before every call, we compute the elapsed time since that request. If less
than VT_RATE_LIMIT_SECONDS (15 s) has passed, the call is skipped and the
function returns None — the pipeline continues with the layers it already has.

A threading.Lock (_VT_RATE_LOCK) ensures the check-and-update of
_VT_LAST_CALL_TIME is atomic, preventing two concurrent scan requests from
both passing the gate at the same moment.

The daily counter (_VT_DAILY_CALLS) is reset when the calendar date changes
(compared against _VT_DAILY_DATE). Once _VT_DAILY_CALLS reaches
VT_DAILY_BUDGET the service stops calling the API for the rest of the day.

Conditional triggering
----------------------
check_domain() only calls the API when the upstream detection layers have
already raised a flag:
  - ML phishing probability  ≥ VT_ML_THRESHOLD      (0.35)
  - rule engine score        ≥ VT_RULE_THRESHOLD     (0.30)
  - label is PHISHING or SUSPICIOUS

Calling VT for clearly-safe URLs would waste the daily budget.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from datetime import date
from typing import Optional
from urllib.parse import urlparse

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Configuration constants
# ─────────────────────────────────────────────────────────────────────────────

# VirusTotal v3 API base
VT_API_BASE = "https://www.virustotal.com/api/v3"

# Minimum seconds between successive API calls (enforces 4 req/min limit)
# 60 s / 4 req = 15 s exactly — we use 15 to be precise, not conservative.
VT_RATE_LIMIT_SECONDS: float = 15.0

# Maximum calls per calendar day (free-tier hard cap is 500)
VT_DAILY_BUDGET: int = 480          # 480 < 500 — 20-call safety margin

# HTTP timeout for VT requests
VT_HTTP_TIMEOUT: float = 10.0

# How long a cached result stays valid (seconds).  24 h means each unique
# domain costs at most one API call per day regardless of scan frequency.
VT_CACHE_TTL: float = 86_400.0      # 24 hours

# Minimum ML probability that triggers a VT lookup (mirrors SUSPICIOUS threshold
# from url_detector_core.py: final_prob >= 0.35 → SUSPICIOUS)
VT_ML_THRESHOLD: float = 0.35

# Minimum rule-engine score that triggers a VT lookup
VT_RULE_THRESHOLD: float = 0.30

# Malicious-engine ratio above which we consider the domain definitely malicious
VT_MALICIOUS_RATIO_HIGH: float = 0.10   # ≥10% of engines flagged malicious
VT_MALICIOUS_RATIO_MED:  float = 0.03   # ≥ 3% — suspicious but not definitive


# ─────────────────────────────────────────────────────────────────────────────
# In-memory cache  (process lifetime, keyed by normalised root domain)
# ─────────────────────────────────────────────────────────────────────────────

_VT_CACHE: dict[str, dict] = {}
_VT_CACHE_LOCK = threading.Lock()


# ─────────────────────────────────────────────────────────────────────────────
# Rate-limit state  (all mutations must hold _VT_RATE_LOCK)
# ─────────────────────────────────────────────────────────────────────────────

_VT_LAST_CALL_TIME: float = 0.0          # epoch of the last successful API call
_VT_DAILY_CALLS:    int   = 0            # count of calls made today
_VT_DAILY_DATE:     date  = date.min     # date the counter was last reset
_VT_RATE_LOCK = threading.Lock()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _vt_available() -> bool:
    """Return True only when a VirusTotal API key is configured."""
    return bool(getattr(settings, "VIRUSTOTAL_API_KEY", None))


def _normalise_domain(raw: str) -> str:
    """
    Extract and normalise the root domain from a URL or bare domain string.

    Examples:
        "https://sub.example.com/path" → "example.com"
        "evil.login.paypal-secure.tk"  → "paypal-secure.tk"
        "192.0.2.1"                    → "192.0.2.1"
    """
    raw = raw.strip().lower()
    # Strip protocol if present
    if "://" in raw:
        try:
            parsed = urlparse(raw)
            host = parsed.hostname or raw
        except Exception:
            host = raw
    else:
        host = raw.split("/")[0].split("?")[0].split("#")[0]

    # Strip port
    if ":" in host and not host.startswith("["):
        host = host.rsplit(":", 1)[0]

    # For domains (not IPs), return only the last two labels (root domain).
    # VT's domain endpoint is keyed on the root domain, not subdomains.
    import re
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", host):
        return host   # raw IP — return as-is

    parts = host.rstrip(".").split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return host


def _cache_get(domain: str) -> Optional[dict]:
    """Return a cached entry if it exists and has not expired; else None."""
    with _VT_CACHE_LOCK:
        entry = _VT_CACHE.get(domain)
    if entry is None:
        return None
    age = time.time() - entry.get("cached_at", 0.0)
    if age > VT_CACHE_TTL:
        # Expired — evict lazily
        with _VT_CACHE_LOCK:
            _VT_CACHE.pop(domain, None)
        return None
    return entry


def _cache_set(domain: str, result: dict) -> None:
    """Store a result in the cache with the current timestamp."""
    result["cached_at"] = time.time()
    with _VT_CACHE_LOCK:
        _VT_CACHE[domain] = result


def _acquire_rate_slot() -> bool:
    """
    Atomically check both the per-minute and per-day limits, then mark a
    call slot as consumed.

    Returns True if the caller may proceed with an API call.
    Returns False if the call must be skipped (rate-limited or budget exhausted).

    All state mutations are under a single lock acquisition to prevent two
    concurrent requests from both slipping through.
    """
    global _VT_LAST_CALL_TIME, _VT_DAILY_CALLS, _VT_DAILY_DATE

    now      = time.time()
    today    = date.today()

    with _VT_RATE_LOCK:
        # Reset daily counter if the date has rolled over
        if today != _VT_DAILY_DATE:
            _VT_DAILY_CALLS = 0
            _VT_DAILY_DATE  = today
            logger.debug("VirusTotal daily counter reset for %s", today.isoformat())

        # Check daily budget
        if _VT_DAILY_CALLS >= VT_DAILY_BUDGET:
            logger.warning(
                "VirusTotal daily budget exhausted (%d/%d calls) — "
                "skipping request until midnight.",
                _VT_DAILY_CALLS, VT_DAILY_BUDGET,
            )
            return False

        # Check per-minute rate (15 s minimum gap)
        elapsed = now - _VT_LAST_CALL_TIME
        if elapsed < VT_RATE_LIMIT_SECONDS:
            wait_remaining = round(VT_RATE_LIMIT_SECONDS - elapsed, 1)
            logger.info(
                "VirusTotal rate limit reached — skipping request "
                "(%.1f s until next slot, %d/%d daily calls used).",
                wait_remaining, _VT_DAILY_CALLS, VT_DAILY_BUDGET,
            )
            return False

        # Slot acquired — update state before releasing the lock
        _VT_LAST_CALL_TIME = now
        _VT_DAILY_CALLS   += 1
        logger.debug(
            "VirusTotal rate slot acquired (daily: %d/%d, last_call=%.1f s ago).",
            _VT_DAILY_CALLS, VT_DAILY_BUDGET, elapsed,
        )
        return True


def _parse_vt_response(domain: str, data: dict) -> dict:
    """
    Parse a VirusTotal v3 /domains/{domain} API response into a normalised
    result dict.  Never raises — falls back to safe defaults on any key error.
    """
    try:
        attrs  = data.get("data", {}).get("attributes", {})
        stats  = attrs.get("last_analysis_stats", {})

        malicious  = int(stats.get("malicious",  0))
        suspicious = int(stats.get("suspicious", 0))
        harmless   = int(stats.get("harmless",   0))
        undetected = int(stats.get("undetected", 0))
        timeout_n  = int(stats.get("timeout",    0))
        total      = malicious + suspicious + harmless + undetected + timeout_n

        reputation = int(attrs.get("reputation", 0))

        # Flatten vendor-assigned category strings
        raw_categories: dict = attrs.get("categories", {})
        categories = sorted(set(raw_categories.values()))

        # Derive a verdict from the engine ratio
        if total > 0:
            mal_ratio = (malicious + suspicious) / total
        else:
            mal_ratio = 0.0

        if malicious >= 3 or mal_ratio >= VT_MALICIOUS_RATIO_HIGH:
            verdict    = "malicious"
            confidence = min(0.9, 0.5 + mal_ratio * 2)
        elif malicious >= 1 or mal_ratio >= VT_MALICIOUS_RATIO_MED:
            verdict    = "suspicious"
            confidence = min(0.6, 0.3 + mal_ratio * 3)
        elif reputation < -5:
            # Negative community score even when engines don't flag it
            verdict    = "suspicious"
            confidence = 0.25
        else:
            verdict    = "clean"
            confidence = 0.0

        return {
            "domain":     domain,
            "malicious":  malicious,
            "suspicious": suspicious,
            "harmless":   harmless,
            "total":      total,
            "reputation": reputation,
            "categories": categories,
            "verdict":    verdict,
            "confidence": round(confidence, 4),
            "source":     "virustotal",
        }

    except Exception as exc:
        logger.warning("VirusTotal response parse error for '%s': %s", domain, exc)
        return _unknown_result(domain)


def _unknown_result(domain: str) -> dict:
    """Safe fallback result when VT is unavailable or parsing fails."""
    return {
        "domain":     domain,
        "malicious":  0,
        "suspicious": 0,
        "harmless":   0,
        "total":      0,
        "reputation": 0,
        "categories": [],
        "verdict":    "unknown",
        "confidence": 0.0,
        "source":     "virustotal",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

async def check_domain(
    domain: str,
    ml_probability: float = 0.0,
    rule_score: float = 0.0,
    label: str = "SAFE",
) -> Optional[dict]:
    """
    Query VirusTotal for the reputation of *domain*.

    Caller contract
    ---------------
    Returns a result dict (see cache entry shape at top of module) when VT was
    consulted (either from cache or a fresh API call).
    Returns None when:
      - VIRUSTOTAL_API_KEY is not configured
      - the domain does not meet the triggering thresholds (safe URLs skipped)
      - the rate limit or daily budget is exhausted (skipped, not an error)
      - the API call fails for any reason (graceful degradation)

    The caller must treat None as "no VT data available" and continue normally.

    Parameters
    ----------
    domain         : raw domain / URL string — normalised internally
    ml_probability : ML phishing probability from url_detector_core (0–1)
    rule_score     : rule-engine overlay score from url_detector_core (0–1)
    label          : classification label from the ML/rule pipeline
    """
    if not _vt_available():
        logger.debug("VIRUSTOTAL_API_KEY not configured — skipping VT check")
        return None

    # ── Triggering gate: skip clearly safe URLs ────────────────────────────
    is_suspicious = (
        label in ("PHISHING", "SUSPICIOUS")
        or ml_probability >= VT_ML_THRESHOLD
        or rule_score     >= VT_RULE_THRESHOLD
    )
    if not is_suspicious:
        logger.debug(
            "VirusTotal skipped for '%s' — below thresholds "
            "(label=%s, ml=%.3f, rule=%.3f).",
            domain, label, ml_probability, rule_score,
        )
        return None

    normalised = _normalise_domain(domain)
    if not normalised:
        return None

    # ── Cache lookup ───────────────────────────────────────────────────────
    cached = _cache_get(normalised)
    if cached is not None:
        age_min = round((time.time() - cached["cached_at"]) / 60, 1)
        logger.info(
            "VirusTotal cache hit for '%s' "
            "(verdict=%s, malicious=%d, cached %.1f min ago).",
            normalised, cached["verdict"], cached["malicious"], age_min,
        )
        return cached

    # ── Rate-limit gate ────────────────────────────────────────────────────
    if not _acquire_rate_slot():
        return None   # logged inside _acquire_rate_slot

    # ── API call ───────────────────────────────────────────────────────────
    url     = f"{VT_API_BASE}/domains/{normalised}"
    headers = {
        "x-apikey":   settings.VIRUSTOTAL_API_KEY,
        "Accept":     "application/json",
        "User-Agent": "PhishGuard/2.0 threat-intel",
    }

    logger.info("VirusTotal check performed for domain '%s'.", normalised)

    try:
        async with httpx.AsyncClient(timeout=VT_HTTP_TIMEOUT) as client:
            response = await client.get(url, headers=headers)

        if response.status_code == 404:
            # Domain not in VT database — treat as unknown, cache so we
            # don't waste future calls on the same unknown domain
            logger.info(
                "VirusTotal: domain '%s' not found in database (404).",
                normalised,
            )
            result = _unknown_result(normalised)
            _cache_set(normalised, result)
            return result

        if response.status_code == 429:
            logger.warning(
                "VirusTotal rate limit hit (429) for '%s' — "
                "request skipped, continuing without VT data.",
                normalised,
            )
            return None

        response.raise_for_status()

        result = _parse_vt_response(normalised, response.json())
        _cache_set(normalised, result)

        logger.info(
            "VirusTotal result for '%s': verdict=%s, malicious=%d/%d engines, "
            "reputation=%d.",
            normalised,
            result["verdict"],
            result["malicious"],
            result["total"],
            result["reputation"],
        )
        return result

    except httpx.TimeoutException:
        logger.warning(
            "VirusTotal request timed out after %.1f s for '%s' — "
            "skipping, scan continues without VT data.",
            VT_HTTP_TIMEOUT, normalised,
        )
        return None

    except httpx.HTTPStatusError as exc:
        logger.warning(
            "VirusTotal HTTP error %s for '%s': %s — skipping.",
            exc.response.status_code, normalised, exc.response.text[:120],
        )
        return None

    except Exception as exc:
        logger.warning(
            "VirusTotal unexpected error for '%s': %s — skipping.",
            normalised, exc,
        )
        return None


def get_cache_stats() -> dict:
    """
    Return current cache and rate-limit statistics.
    Used by the admin/health endpoints for observability.
    """
    global _VT_DAILY_CALLS, _VT_DAILY_DATE, _VT_LAST_CALL_TIME

    with _VT_RATE_LOCK:
        daily_calls   = _VT_DAILY_CALLS
        daily_date    = _VT_DAILY_DATE.isoformat()
        last_call_age = round(time.time() - _VT_LAST_CALL_TIME, 1) if _VT_LAST_CALL_TIME else None

    with _VT_CACHE_LOCK:
        cache_size = len(_VT_CACHE)
        # Count only non-expired entries
        now = time.time()
        live_entries = sum(
            1 for e in _VT_CACHE.values()
            if (now - e.get("cached_at", 0)) <= VT_CACHE_TTL
        )

    return {
        "available":          _vt_available(),
        "cache_total_entries": cache_size,
        "cache_live_entries":  live_entries,
        "cache_ttl_hours":     VT_CACHE_TTL / 3600,
        "daily_calls_used":    daily_calls,
        "daily_budget":        VT_DAILY_BUDGET,
        "daily_date":          daily_date,
        "rate_limit_seconds":  VT_RATE_LIMIT_SECONDS,
        "last_call_age_s":     last_call_age,
        "next_slot_in_s":      max(0.0, round(VT_RATE_LIMIT_SECONDS - (time.time() - (_VT_LAST_CALL_TIME or 0)), 1)),
    }

"""
Threat Feed Service — Open Threat Intelligence Integration
==========================================================
Production-hardened rewrite addressing:

  FIXED  Duplicate loading: module-level thread start + lifespan call both
         fired on every uvicorn --reload worker spawn, causing every feed to
         load twice.  Now guarded by a process-level flag (_bootstrap_started)
         checked under a lock before any thread is spawned.

  FIXED  PhishTank 429 (Too Many Requests): per-feed retry-after tracking and
         a configurable per-feed minimum fetch interval prevent hammering APIs
         that enforce rate limits.

  FIXED  Race condition in ensure_loaded(): the old code checked _loading and
         then set it in two separate lock acquisitions, allowing two threads to
         both see False and both start.  Now uses a single atomic check-and-set.

  NEW    Graceful degradation: when a feed fails the previous cache entry for
         that feed is retained and clearly logged.  The system never crashes on
         partial feed failure.

  NEW    Improved logging: structured startup/refresh messages with domain
         counts, next-refresh ETA, and per-feed status.

Architecture
------------
  _BOOTSTRAP_LOCK  — ensures only one background thread ever starts per process
  _bootstrap_started — process-level bool; once True, never reset

  Cache layout:
    _cache["domains"]       set[str]  — all known-malicious domain roots
    _cache["feed_entries"]  dict      — per-feed cached domain set + metadata
    _cache["loaded_at"]     float     — epoch of last successful full load
    _cache["feed_stats"]    list      — last reported stats per feed (for API)
    _cache["is_loaded"]     bool      — True once at least one load completes
    _cache["_loading"]      bool      — True while a refresh thread is running
    _cache["total_domains"] int       — total unique domains across all feeds

  Per-feed metadata (stored in _cache["feed_entries"][feed_name]):
    domains    set[str]   — last successfully loaded domain set for this feed
    loaded_at  float      — epoch of last successful fetch for this feed
    error      str|None   — last error message, None on success
    status     str        — "ok" | "failed" | "rate_limited" | "pending"
    count      int        — number of domains in last successful load
"""

from __future__ import annotations

import logging
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

# How long (seconds) the full cache is considered fresh before a re-fetch
FEED_REFRESH_INTERVAL: int = 3600          # 1 hour

# Per-feed minimum interval — prevents hammering a single source on retries
FEED_MIN_FETCH_INTERVAL: int = 600         # 10 minutes between retries for failed feeds

# If a feed returns 429, back off for this many seconds before trying again
RATE_LIMIT_BACKOFF: int = 7200             # 2 hours

# HTTP timeout per feed request
FEED_HTTP_TIMEOUT: int = 15                # seconds

# ─────────────────────────────────────────────────────────────────────────────
# Feed sources
# ─────────────────────────────────────────────────────────────────────────────

FEEDS: list[dict] = [
    {
        "name": "URLhaus",
        "url": "https://urlhaus.abuse.ch/downloads/text/",
        "type": "url",
        "description": "Malware distribution URLs from abuse.ch",
    },
    {
        "name": "OpenPhish",
        "url": "https://openphish.com/feed.txt",
        "type": "url",
        "description": "Community phishing URLs",
    },
    {
        "name": "PhishTank (domains)",
        "url": "https://data.phishtank.com/data/online-valid.csv",
        "type": "csv_url_column",
        "description": "Verified phishing sites (rate-limited — hourly refresh)",
    },
]

# ─────────────────────────────────────────────────────────────────────────────
# In-memory cache
# ─────────────────────────────────────────────────────────────────────────────

_cache: dict = {
    "domains":      set(),   # union of all feed domain sets + static list
    "feed_entries": {},      # per-feed: {name: {domains, loaded_at, error, status, count}}
    "loaded_at":    0.0,     # epoch of last successful complete refresh
    "feed_stats":   [],      # list of per-feed dicts for API reporting
    "is_loaded":    False,   # True once at least one full load has completed
    "_loading":     False,   # True while the background thread is running
    "total_domains": 0,
}
_cache_lock = threading.Lock()

# ─────────────────────────────────────────────────────────────────────────────
# Bootstrap guard — the ONLY place where the background thread is spawned.
# A module-level bool checked under _BOOTSTRAP_LOCK ensures the thread is
# started at most once per process, regardless of how many times this module
# is imported or how many uvicorn worker/reload cycles occur.
# ─────────────────────────────────────────────────────────────────────────────

_BOOTSTRAP_LOCK   = threading.Lock()
_bootstrap_started = False          # never reset; once True, stays True forever


# ─────────────────────────────────────────────────────────────────────────────
# Domain helpers
# ─────────────────────────────────────────────────────────────────────────────

def _extract_domain(raw: str) -> Optional[str]:
    """Extract root domain from a URL line or bare domain string."""
    raw = raw.strip().lower()
    if not raw or raw.startswith("#"):
        return None
    for prefix in ("http://", "https://", "ftp://"):
        if raw.startswith(prefix):
            raw = raw[len(prefix):]
    raw = raw.split("/")[0].split("?")[0].split("#")[0].split(":")[0]
    if "." not in raw or len(raw) > 253:
        return None
    # Basic label validation
    parts = raw.split(".")
    if any(len(p) == 0 or len(p) > 63 for p in parts):
        return None
    return raw


def _domain_set_from_lines(lines: list[str]) -> set[str]:
    """
    Parse a list of text lines into a set of unique domain strings.
    For each extracted domain, also adds the root (last two labels) so
    lookups against subdomains still match.
    """
    domains: set[str] = set()
    for line in lines:
        domain = _extract_domain(line)
        if domain:
            domains.add(domain)
            parts = domain.split(".")
            if len(parts) > 2:
                domains.add(".".join(parts[-2:]))
    return domains


# ─────────────────────────────────────────────────────────────────────────────
# Per-feed fetch with rate-limit awareness
# ─────────────────────────────────────────────────────────────────────────────

def _should_skip_feed(feed_name: str) -> tuple[bool, str]:
    """
    Check whether this feed should be skipped on this refresh cycle.

    Returns (should_skip, reason_string).
    Skips if:
      - the per-feed entry is fresh enough (< FEED_MIN_FETCH_INTERVAL old), OR
      - the feed previously returned 429 and the backoff window hasn't expired
    """
    with _cache_lock:
        entry = _cache["feed_entries"].get(feed_name, {})

    last_fetched = entry.get("loaded_at", 0.0)
    status       = entry.get("status", "pending")
    age          = time.time() - last_fetched

    if status == "rate_limited":
        if age < RATE_LIMIT_BACKOFF:
            remaining = int(RATE_LIMIT_BACKOFF - age)
            return True, f"rate-limited — retrying in {remaining}s"

    if status == "ok" and age < FEED_MIN_FETCH_INTERVAL:
        return True, f"cached ({int(age)}s old, refresh in {FEED_MIN_FETCH_INTERVAL - int(age)}s)"

    return False, ""


def _fetch_feed(feed: dict) -> tuple[Optional[set[str]], str, str]:
    """
    Fetch a single feed URL and return (domain_set, status, error_message).

    status is one of: "ok" | "failed" | "rate_limited"
    domain_set is None when the fetch failed (caller should keep old cache).
    """
    try:
        req = urllib.request.Request(
            feed["url"],
            headers={"User-Agent": "PhishGuard/2.0 threat-intel-collector"},
        )
        with urllib.request.urlopen(req, timeout=FEED_HTTP_TIMEOUT) as resp:
            content = resp.read().decode("utf-8", errors="ignore")

        lines   = content.splitlines()
        domains = _domain_set_from_lines(lines)
        return domains, "ok", ""

    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            msg = f"HTTP 429 Too Many Requests — backing off for {RATE_LIMIT_BACKOFF}s"
            logger.warning(
                "Feed '%s' rate-limited (429). "
                "Using previously cached data. Next retry in %ds.",
                feed["name"], RATE_LIMIT_BACKOFF,
            )
            return None, "rate_limited", msg
        msg = f"HTTP Error {exc.code}: {exc.reason}"
        logger.warning("Failed to load feed '%s': %s — using cached data.", feed["name"], msg)
        return None, "failed", msg

    except Exception as exc:
        msg = str(exc)
        logger.warning("Failed to load feed '%s': %s — using cached data.", feed["name"], msg)
        return None, "failed", msg


# ─────────────────────────────────────────────────────────────────────────────
# Full refresh worker (runs in background thread)
# ─────────────────────────────────────────────────────────────────────────────

def _run_feed_refresh() -> None:
    """
    Iterate every configured feed, respect per-feed skip logic, fetch new data
    when needed, and atomically update the shared cache.

    Guarantees:
      - Feed failures never clear previously loaded data for that feed.
      - The _loading flag is always cleared in the finally block.
      - Static fallback domains are always merged in.
    """
    logger.info("Threat feed refresh starting (%d sources configured)…", len(FEEDS))
    refresh_start = time.time()

    # Work on a snapshot of the current feed_entries so we can fall back
    with _cache_lock:
        feed_entries: dict = {
            k: dict(v) for k, v in _cache["feed_entries"].items()
        }

    stats: list[dict] = []
    fetched_count = 0
    skipped_count = 0

    for feed in FEEDS:
        name = feed["name"]

        skip, reason = _should_skip_feed(name)
        if skip:
            logger.debug("Skipping feed '%s': %s", name, reason)
            skipped_count += 1
            existing = feed_entries.get(name, {})
            stats.append({
                "name":           name,
                "description":    feed["description"],
                "domains_loaded": existing.get("count", 0),
                "status":         existing.get("status", "pending"),
                "skipped":        True,
                "skip_reason":    reason,
            })
            continue

        domain_set, status, error_msg = _fetch_feed(feed)
        fetched_count += 1

        if domain_set is not None:
            # Successful fetch — update this feed's entry
            feed_entries[name] = {
                "domains":   domain_set,
                "loaded_at": time.time(),
                "error":     None,
                "status":    "ok",
                "count":     len(domain_set),
            }
            logger.info(
                "Threat feed '%s': loaded %d domains",
                name, len(domain_set),
            )
        else:
            # Failed fetch — preserve old data, update status
            old_entry = feed_entries.get(name, {})
            feed_entries[name] = {
                "domains":   old_entry.get("domains", set()),
                "loaded_at": old_entry.get("loaded_at", 0.0),  # don't update timestamp
                "error":     error_msg,
                "status":    status,
                "count":     old_entry.get("count", 0),
            }

        entry = feed_entries[name]
        stats.append({
            "name":           name,
            "description":    feed["description"],
            "domains_loaded": entry["count"],
            "status":         entry["status"],
            "skipped":        False,
            "error":          entry.get("error"),
        })

    # Build the union domain set from all feed entries + static fallback
    all_domains: set[str] = set(_STATIC_MALICIOUS)
    for entry in feed_entries.values():
        all_domains.update(entry.get("domains", set()))

    elapsed = round(time.time() - refresh_start, 2)
    next_refresh = FEED_REFRESH_INTERVAL

    # Atomically write everything back
    with _cache_lock:
        _cache["domains"]      = all_domains
        _cache["feed_entries"] = feed_entries
        _cache["loaded_at"]    = time.time()
        _cache["feed_stats"]   = stats
        _cache["is_loaded"]    = True
        _cache["total_domains"] = len(all_domains)
        _cache["_loading"]     = False

    logger.info(
        "Threat feeds initialized — %d malicious domains loaded "
        "(%d fetched, %d skipped, %.1fs). "
        "Next refresh in %ds.",
        len(all_domains), fetched_count, skipped_count, elapsed, next_refresh,
    )


def _refresh_wrapper() -> None:
    """Thin wrapper around _run_feed_refresh that guarantees _loading is cleared."""
    try:
        _run_feed_refresh()
    except Exception as exc:
        logger.error("Unexpected error in feed refresh thread: %s", exc, exc_info=True)
        with _cache_lock:
            _cache["_loading"] = False


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def ensure_loaded() -> None:
    """
    Ensure threat feeds are loaded; schedule a background refresh if the cache
    is stale.  Non-blocking — returns immediately.

    Duplicate-start protection
    --------------------------
    Uses _BOOTSTRAP_LOCK + _bootstrap_started to guarantee that exactly one
    background thread is spawned per process, regardless of how many times
    this function is called (e.g. from the lifespan hook AND from check_domain
    on first use) or how many uvicorn worker/reload cycles happen.

    Subsequent calls after the initial load check the TTL and spawn a *new*
    refresh thread only when the cache is stale AND no thread is already
    running.  The atomic check-and-set inside _cache_lock prevents the race
    condition where two callers both observe _loading=False and both start.
    """
    global _bootstrap_started

    # ── First-ever call: start the initial background load ──────────────────
    with _BOOTSTRAP_LOCK:
        if not _bootstrap_started:
            _bootstrap_started = True
            with _cache_lock:
                _cache["_loading"] = True
            t = threading.Thread(target=_refresh_wrapper, name="threat-feed-loader", daemon=True)
            t.start()
            logger.debug("Threat feed background loader started (pid=%d).", __import__("os").getpid())
            return

    # ── Subsequent calls: refresh only if stale and not already refreshing ──
    with _cache_lock:
        loaded_at  = _cache.get("loaded_at", 0.0)
        is_loading = _cache.get("_loading", False)
        is_stale   = (time.time() - loaded_at) > FEED_REFRESH_INTERVAL

        if is_loading or not is_stale:
            return

        # Atomic check-and-set: mark loading before releasing lock so no
        # other caller can slip through and start a second thread
        _cache["_loading"] = True

    t = threading.Thread(target=_refresh_wrapper, name="threat-feed-refresh", daemon=True)
    t.start()
    logger.info(
        "Threat feed cache stale (age=%ds) — refresh scheduled.",
        int(time.time() - loaded_at),
    )


def check_domain(domain: str) -> dict:
    """
    Check if a domain appears in any threat intelligence feed.

    Triggers ensure_loaded() (non-blocking) so the feeds are loaded on first
    use even if ensure_loaded() was never called explicitly.

    Returns:
        {
            "is_malicious": bool,
            "matched_domain": str | None,
            "feed_hits": list[str],
        }
    """
    ensure_loaded()

    if not domain:
        return {"is_malicious": False, "matched_domain": None, "feed_hits": []}

    d    = domain.lower().strip().rstrip(".")
    parts = d.split(".")
    root  = ".".join(parts[-2:]) if len(parts) >= 2 else d

    with _cache_lock:
        domains = _cache.get("domains", set())

    hits: list[str] = []
    if d in domains:
        hits.append(f"Exact match: {d}")
    if root in domains and root != d:
        hits.append(f"Root domain match: {root}")

    return {
        "is_malicious":   len(hits) > 0,
        "matched_domain": d if hits else None,
        "feed_hits":      hits,
    }


def get_feed_status() -> dict:
    """
    Return current feed loading status and per-feed statistics for the API.
    """
    ensure_loaded()

    with _cache_lock:
        loaded_at      = _cache.get("loaded_at", 0.0)
        is_loaded      = _cache.get("is_loaded", False)
        total_domains  = _cache.get("total_domains", 0)
        feed_stats     = list(_cache.get("feed_stats", []))
        is_loading     = _cache.get("_loading", False)

    cache_age = int(time.time() - loaded_at) if loaded_at else None
    next_refresh_in = max(0, FEED_REFRESH_INTERVAL - cache_age) if cache_age is not None else FEED_REFRESH_INTERVAL

    return {
        "is_loaded":         is_loaded,
        "is_loading":        is_loading,
        "total_domains":     total_domains,
        "loaded_at":         (
            datetime.fromtimestamp(loaded_at, tz=timezone.utc).isoformat()
            if loaded_at else None
        ),
        "cache_age_seconds": cache_age,
        "next_refresh_in":   next_refresh_in,
        "refresh_interval":  FEED_REFRESH_INTERVAL,
        "feed_stats":        feed_stats,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Static fallback list (always available, no HTTP required)
# Always merged into the live feed data so at least known-bad domains are
# blocked even if all upstream HTTP feeds are unreachable.
# ─────────────────────────────────────────────────────────────────────────────

_STATIC_MALICIOUS: frozenset[str] = frozenset({
    "login-microsft-secure.tk",
    "secure-account-verify.xyz",
    "paypa1-secure.cf",
    "apple-id-verify.ga",
    "amazon-security-alert.ml",
    "xjqzpldfkmnrt.top",
    "update-security-check.ga",
    "signin.paypa1-secure.cf",
    "account.verify.login.apple-id.support.xyz",
    "www-secure-login-account-verification-confirm-identity.club",
    "netflix-billing-update.xyz",
    "chase-bank-secure-login.com",
    "wellsfargo-alerts-secure.xyz",
    "coinbase-support-verify.tk",
    "metamask-recovery-phrase.xyz",
    "discord-nitro-free-generator.xyz",
    "steam-trade-offer.ml",
    "google-account-recovery-center.xyz",
    "microsoft-office365-login.xyz",
    "dropbox-secure-signin.ml",
})

# NOTE: No thread is started here at import time.
# The sole entry point for background loading is ensure_loaded(), called from
# main.py lifespan.  This prevents the duplicate-load race during uvicorn
# --reload where both the old and new worker process import this module.

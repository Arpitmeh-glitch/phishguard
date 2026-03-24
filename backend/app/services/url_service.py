"""
URL Phishing Detection Service
================================
Detection pipeline (in order):

  Layer 1 + 2 — RandomForest ML model + rule-based overlay
                (improved_url_detector.predict)

  Layer 3     — VirusTotal domain reputation
                Called only when ML/rule layers already flag the URL as
                suspicious or phishing.  Skipped on clearly-safe URLs to
                protect the free-tier daily budget (500 req/day).
                Rate-limited to 4 req/min (15 s minimum gap) with 24-hour
                in-memory caching per root domain.

  Layer 4     — Gemini AI deep threat explanation
                Called only for PHISHING or SUSPICIOUS results; adds a
                human-readable summary and threat-level explanation.

  Final       — Weighted confidence merge and risk_score (0-100 int)

All external layers (VT, Gemini) are fully optional: if their keys are absent
or the calls fail, the pipeline returns the ML+rule result unchanged.

FIX CHANGELOG (production bug fixes):
  - initialize() now logs whitelist stats AND raises if the detector is broken,
    instead of silently setting _initialized = False and returning SAFE for
    every URL.
  - initialize() checks csv_load_succeeded from whitelist_stats() and logs a
    WARNING if CSV files were missing — this is the most common production
    misconfiguration.
  - scan_url_async() logs the incoming URL and the final result at INFO level
    so every scan is traceable in production logs.
  - The fallback in scan_url() (triggered on asyncio.run() failures) now also
    logs clearly so it is visible when it activates.
  - _normalize_predict_result() logs a WARNING when unexpected keys are missing
    from the detector output, making schema drift visible.
  - No changes to scoring logic, thresholds, or detection rules.
"""

import logging
import asyncio
from typing import Optional
from urllib.parse import urlparse

from app.services import improved_url_detector as _core  # upgraded detector
from app.services import ai_service
from app.services import virustotal_service as _vt
from pathlib import Path
import joblib

MODEL = None

def load_model():
    global MODEL
    try:
        BASE_DIR = Path(__file__).resolve().parent
        MODEL_PATH = BASE_DIR / "model.pkl"
        MODEL = joblib.load(MODEL_PATH)
        logger.info("✅ ML model loaded successfully")
    except Exception as e:
        logger.error(f"❌ Failed to load ML model: {e}")
        MODEL = None

logger = logging.getLogger(__name__)

# Module-level model reference
_initialized = False


def initialize() -> None:
    """
    Prepare the URL detector.

    improved_url_detector is self-contained (rule-based + optional ML).
    It loads its whitelist at import time and needs no explicit model
    initialisation.  We verify the module is healthy by calling
    whitelist_stats() and log the result clearly.

    FIX: Previously, any exception here was caught, _initialized was set to
    False, and the function returned silently.  Every subsequent call to
    scan_url_async() would then call initialize() again, fail again, and
    fall through to the error-return block which returned label="SAFE"
    with confidence=0.0 — making ALL URLs appear safe in production.

    Now: exceptions are re-raised so the FastAPI startup hook fails loudly,
    and a WARNING is emitted when CSV whitelists are missing.
    """
    load_model()
    global _initialized
    if _initialized:
        return
    try:
        stats = _core.whitelist_stats()

        # ── Log whitelist health ──────────────────────────────────────────
        logger.info(
            "✅ URL detector initialised | whitelist_total=%d | csv=%d | builtin=%d",
            stats.get("total_entries", 0),
            stats.get("csv_entries", 0),
            stats.get("builtin_entries", 0),
        )

        # ── Warn if CSV files were not found (common production misconfiguration)
        if not stats.get("csv_load_succeeded", False):
            logger.warning(
                "⚠️  URL detector: no CSV whitelist files were loaded. "
                "Detection will work but false-positive rates may be higher. "
                "Searched paths: %s  "
                "Place top-1m.csv or tranco_L6J4.csv in backend/data/ and redeploy.",
                stats.get("search_paths", []),
            )

        _initialized = True

    except Exception as e:
        # Re-raise so startup fails loudly rather than silently returning SAFE
        # for every URL. Ops teams need to see this.
        logger.error("❌ URL detector init FAILED — service cannot scan URLs: %s", e)
        _initialized = False
        raise


def _normalize_predict_result(raw: dict) -> dict:
    """
    Normalise the dict returned by improved_url_detector.predict() so that
    it is fully compatible with the shape the rest of url_service.py and its
    callers expect.

    FIX: Added per-key WARNING logs so schema drift (e.g. a future version
    of the detector renaming a key) is immediately visible in production logs
    rather than silently producing default values.
    """
    expected_keys = {
        "label", "confidence", "risk_tier", "ml_probability",
        "rule_score", "reasons", "detection_mode", "whitelist_hit",
    }
    missing = expected_keys - raw.keys()
    if missing:
        logger.warning(
            "⚠️  improved_url_detector.predict() returned unexpected schema — "
            "missing keys: %s  (using defaults). This may indicate a version mismatch.",
            missing,
        )

    return {
        "label":          raw.get("label", "SAFE"),
        "confidence":     float(raw.get("confidence", 0.0)),
        "risk_tier":      raw.get("risk_tier", "LOW"),
        "ml_probability": float(raw.get("ml_probability", 0.0)),
        "rule_score":     float(raw.get("rule_score", 0.0)),
        "reasons":        list(raw.get("reasons", [])),
        "detection_mode": raw.get("detection_mode", "rule-based"),
        "whitelist_hit":  bool(raw.get("whitelist_hit", False)),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_domain(url: str) -> str:
    """Return the hostname/domain portion of a URL for context strings."""
    try:
        parsed = urlparse(url if url.startswith("http") else "https://" + url)
        return parsed.netloc or url
    except Exception:
        return url


def _build_risk_score_int(confidence: float) -> int:
    return int(round(confidence * 100))


# ── Score merging ─────────────────────────────────────────────────────────────

_VT_VERDICT_BOOST   = {"malicious": 0.20, "suspicious": 0.08, "clean": 0.0, "unknown": 0.0}
_AI_THREAT_BOOST    = {"high": 0.15, "medium": 0.05, "low": 0.0, "safe": 0.0}


def _apply_vt_boost(threat_score: float, vt_result: Optional[dict]) -> float:
    """
    Adjust threat score based on VirusTotal verdict.
    Boosts score for malicious/suspicious, and REDUCES score for clean verdicts
    to save legitimate URLs from overzealous ML flagging.
    """
    if vt_result is None:
        return threat_score

    verdict = vt_result.get("verdict", "unknown")
    vt_conf = float(vt_result.get("confidence", 0.0))

    if verdict == "clean":
        # Drastically drop the threat score if VT confirms it is a clean domain
        return round(max(0.0, threat_score - 0.40), 4)

    base_boost   = _VT_VERDICT_BOOST.get(verdict, 0.0)
    actual_boost = base_boost * (0.5 + vt_conf * 0.5)
    return round(min(threat_score + actual_boost, 1.0), 4)


def _reclassify(threat_score: float, current_label: str) -> str:
    """
    Re-derive the label from the merged threat score.
    Allows VT 'clean' verdicts to safely downgrade false positive labels.
    """
    if threat_score >= 0.65:
        return "PHISHING"
    if threat_score >= 0.35:
        return "SUSPICIOUS"
    return "SAFE"


def _apply_ai_boost(confidence: float, ai_result: Optional[dict]) -> float:
    """
    Slightly boost confidence when Gemini confirms a high threat level.
    Capped at 1.0 and never reduces an existing score.
    """
    if ai_result is None:
        return confidence
    boost = _AI_THREAT_BOOST.get(ai_result.get("threat_level", "low"), 0.0)
    return round(min(confidence + boost, 1.0), 4)


# ── Async pipeline ────────────────────────────────────────────────────────────

async def scan_url_async(url: str) -> dict:
    """
    Full async detection pipeline.  Called directly from the FastAPI route.
    """
    # ── FIX: Log every scan entry so we can verify the detector is actually
    # being reached in production. If logs show this line but all results are
    # SAFE, the issue is in the scoring layers below, not in routing.
    logger.info("scan_url_async() START | url=%s", url[:200])

    if not _initialized:
        # FIX: initialize() now raises on failure instead of silently returning.
        # This means if initialization failed at startup, we get a clear error
        # here rather than a silent SAFE result.
        initialize()

    # ── Layer 1 + 2: ML model + rule-based overlay ────────────────────────
    try:
        raw_result = _core.predict(url.strip(), model=MODEL)
        result     = _normalize_predict_result(raw_result)
        logger.debug(
            "scan_url_async() core result | label=%s | confidence=%.4f | "
            "rule_score=%.4f | reasons=%d | mode=%s | url=%s",
            result.get("label"), result.get("confidence"),
            result.get("rule_score"), len(result.get("reasons", [])),
            result.get("detection_mode"), url[:80],
        )
    except RuntimeError as e:
        logger.error("URL scan failed (model not loaded): %s", e)
        result = {
            "label":          "SAFE",
            "confidence":     0.0,
            "risk_tier":      "LOW",
            "ml_probability": 0.0,
            "rule_score":     0.0,
            "reasons":        ["Model not available — scan inconclusive"],
            "detection_mode": "error",
        }
    except Exception as e:
        logger.error("Unexpected URL scan error: %s", e)
        raise

    current_label       = result.get("label", "SAFE")
    original_confidence = result.get("confidence", 0.0)
    ml_prob             = result.get("ml_probability", 0.0)
    rule_score          = result.get("rule_score", 0.0)

    # improved_url_detector.predict() returns label confidence
    # (e.g., 0.95 for SAFE meaning 95% confidence it is safe).
    # We need a unified risk score (0.0 to 1.0 where 1.0 is max threat)
    # for VT/AI boosts and reclassification.
    if current_label == "SAFE":
        current_threat_score = max(0.0, 1.0 - original_confidence)
    else:
        current_threat_score = original_confidence

    # ── Layer 3: VirusTotal domain reputation ─────────────────────────────
    vt_result: Optional[dict] = None
    try:
        domain = _extract_domain(url)
        vt_result = await _vt.check_domain(
            domain         = domain,
            ml_probability = ml_prob,
            rule_score     = rule_score,
            label          = current_label,
        )
        if vt_result:
            logger.debug(
                "scan_url_async() VT result | verdict=%s | malicious=%s | url=%s",
                vt_result.get("verdict"), vt_result.get("malicious"), url[:80],
            )
    except Exception as exc:
        logger.warning("VirusTotal layer skipped due to unexpected error: %s", exc)

    after_vt_threat = _apply_vt_boost(current_threat_score, vt_result)

    if vt_result and vt_result.get("verdict") in ("malicious", "suspicious"):
        vt_reason = (
            f"VirusTotal: {vt_result['malicious']} engine(s) flagged malicious, "
            f"{vt_result['suspicious']} suspicious out of {vt_result['total']} total"
        )
        if vt_reason not in result.get("reasons", []):
            result.setdefault("reasons", []).append(vt_reason)

    current_label = _reclassify(after_vt_threat, current_label)

    # ── Layer 4: Gemini AI deep threat explanation ────────────────────────
    ai_result: Optional[dict] = None

    ml_safe_prob = 1.0 - ml_prob

    if ml_safe_prob >= 0.95 or ml_prob >= 0.95:
        logger.debug("scan_url_async() skipping AI — ML confidence high | ml_prob=%.4f", ml_prob)
    elif current_label in ("PHISHING", "SUSPICIOUS"):
        vt_summary = ""
        if vt_result and vt_result.get("verdict") != "unknown":
            vt_summary = (
                f"\nVirusTotal verdict: {vt_result['verdict']} "
                f"({vt_result['malicious']} malicious, "
                f"{vt_result['suspicious']} suspicious / {vt_result['total']} engines)"
            )
        domain_context = (
            f"Domain: {_extract_domain(url)}\n"
            f"Full URL: {url}\n"
            f"Detection reasons: {', '.join(result.get('reasons', []))}"
            f"{vt_summary}"
        )
        try:
            ai_result = await ai_service.explain_threat(domain_context)
            if ai_result:
                logger.debug(
                    "scan_url_async() AI result | threat_level=%s | url=%s",
                    ai_result.get("threat_level"), url[:80],
                )
        except Exception as exc:
            logger.warning("Gemini threat explanation skipped: %s", exc)

    # ── Final merge ───────────────────────────────────────────────────────
    final_threat = _apply_ai_boost(after_vt_threat, ai_result)
    final_label  = _reclassify(final_threat, current_label)

    if final_label == "SAFE":
        final_confidence = max(0.0, 1.0 - final_threat)
    else:
        final_confidence = final_threat

    result["label"]              = final_label
    result["confidence"]         = round(final_confidence, 4)
    result["risk_score"]         = _build_risk_score_int(final_threat)
    result["vt_result"]          = vt_result
    result["vt_used"]            = vt_result is not None
    result["threat_explanation"] = ai_result
    result["ai_analysis"]        = ai_result
    result["ai_used"]            = ai_result is not None

    # ── FIX: Log final result so every scan produces a traceable audit line ──
    logger.info(
        "scan_url_async() DONE | label=%s | risk_score=%d | "
        "vt_used=%s | ai_used=%s | url=%s",
        final_label, result["risk_score"],
        result["vt_used"], result["ai_used"], url[:200],
    )

    return result


def scan_url(url: str) -> dict:
    """
    Safe sync wrapper for async scan_url_async.
    Works in background threads (FastAPI).

    FIX: The fallback path now logs clearly when it activates so it is
    visible in production logs that the async path failed and a simpler
    result was returned.
    """
    try:
        return asyncio.run(scan_url_async(url))

    except RuntimeError as e:
        # If already inside an event loop (rare case)
        logger.warning("scan_url: event loop already running, using thread pool: %s", e)

        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(asyncio.run, scan_url_async(url))
            return future.result(timeout=30)

    except Exception as exc:
        logger.warning(
            "scan_url: async pipeline failed, falling back to core-only result: %s", exc
        )
        try:
            raw_result = _core.predict(url.strip())
            result     = _normalize_predict_result(raw_result)

            current_label = result.get("label", "SAFE")
            conf          = result.get("confidence", 0.0)
            threat_score  = conf if current_label != "SAFE" else max(0.0, 1.0 - conf)

            result["risk_score"] = _build_risk_score_int(threat_score)
            result["vt_result"]  = None
            result["vt_used"]    = False
            result["ai_analysis"] = None
            result["ai_used"]    = False

            logger.info(
                "scan_url() fallback result | label=%s | risk_score=%d | url=%s",
                current_label, result["risk_score"], url[:200],
            )
            return result

        except Exception as e:
            logger.error("URL scan fallback also failed: %s", e)
            # FIX: Return a clearly-marked error result rather than a silent SAFE.
            # risk_score=50 (unknown) is safer than 0 (safe) when we have no data.
            return {
                "label":          "UNKNOWN",
                "confidence":     0.0,
                "risk_score":     50,   # neutral — caller should treat as inconclusive
                "risk_tier":      "MEDIUM",
                "reasons":        [f"Scan failed: {e}"],
                "vt_result":      None,
                "vt_used":        False,
                "ai_analysis":    None,
                "ai_used":        False,
                "detection_mode": "error",
            }
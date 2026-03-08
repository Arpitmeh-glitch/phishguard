"""
URL Phishing Detection Service
================================
Detection pipeline (in order):

  Layer 1 + 2 — RandomForest ML model + rule-based overlay
                (url_detector_core.predict_url)

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
"""

import logging
import asyncio
from typing import Optional
from urllib.parse import urlparse

from app.services import url_detector_core as _core
from app.services import ai_service
from app.services import virustotal_service as _vt

logger = logging.getLogger(__name__)

# Module-level model reference
_initialized = False


def initialize() -> None:
    """Load or train the RandomForest model.  Call once at startup."""
    global _initialized
    if _initialized:
        return
    try:
        model = _core.load_or_train_model()
        _core.set_model(model)
        _initialized = True
        logger.info("✅ URL detection model initialized")
    except Exception as e:
        logger.warning("⚠ URL model init failed (may need datasets): %s", e)
        _initialized = True


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

# Confidence boosts applied when external layers confirm a threat.
# Values are additive and capped at 1.0; they never reduce an existing score.
_VT_VERDICT_BOOST   = {"malicious": 0.20, "suspicious": 0.08, "clean": 0.0, "unknown": 0.0}
_AI_THREAT_BOOST    = {"high": 0.15, "medium": 0.05, "low": 0.0, "safe": 0.0}


def _apply_vt_boost(confidence: float, vt_result: Optional[dict]) -> float:
    """
    Boost confidence when VirusTotal reports a malicious or suspicious verdict.
    The boost is proportional to VT's own confidence so a single-engine flag
    (low vt confidence) adds less weight than a consensus finding.
    """
    if vt_result is None:
        return confidence
    verdict     = vt_result.get("verdict", "unknown")
    vt_conf     = float(vt_result.get("confidence", 0.0))
    base_boost  = _VT_VERDICT_BOOST.get(verdict, 0.0)
    # Scale the boost by VT's confidence so partial findings have less impact
    actual_boost = base_boost * (0.5 + vt_conf * 0.5)
    return round(min(confidence + actual_boost, 1.0), 4)


def _apply_ai_boost(confidence: float, ai_result: Optional[dict]) -> float:
    """
    Slightly boost confidence when Gemini confirms a high threat level.
    Capped at 1.0 and never reduces an existing score.
    """
    if ai_result is None:
        return confidence
    boost = _AI_THREAT_BOOST.get(ai_result.get("threat_level", "low"), 0.0)
    return round(min(confidence + boost, 1.0), 4)


def _reclassify(confidence: float, current_label: str) -> str:
    """
    Re-derive the label from the merged confidence so downstream consumers
    see a consistent label/confidence pair even after boost layers fire.
    Only upgrades severity — never downgrades a label that was set by the
    ML/rule pipeline.
    """
    if confidence >= 0.65:
        return "PHISHING"
    if confidence >= 0.35:
        # Upgrade SAFE → SUSPICIOUS if boosted over threshold; never downgrade
        # PHISHING → SUSPICIOUS
        if current_label == "SAFE":
            return "SUSPICIOUS"
        return current_label
    return current_label


# ── Async pipeline ────────────────────────────────────────────────────────────

async def scan_url_async(url: str) -> dict:
    """
    Full async detection pipeline.  Called directly from the FastAPI route.
    """
    if not _initialized:
        initialize()

    # ── Layer 1 + 2: ML model + rule-based overlay ────────────────────────
    try:
        result = _core.predict_url(url.strip())
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

    current_label   = result.get("label", "SAFE")
    base_confidence = result.get("confidence", 0.0)
    ml_prob         = result.get("ml_probability", 0.0)
    rule_score      = result.get("rule_score", 0.0)

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
    except Exception as exc:
        logger.warning("VirusTotal layer skipped due to unexpected error: %s", exc)

    # Apply VT boost
    after_vt_confidence = _apply_vt_boost(base_confidence, vt_result)

    # If VT pushed us over the PHISHING threshold, append a reason
    if vt_result and vt_result.get("verdict") in ("malicious", "suspicious"):
        vt_reason = (
            f"VirusTotal: {vt_result['malicious']} engine(s) flagged malicious, "
            f"{vt_result['suspicious']} suspicious out of {vt_result['total']} total"
        )
        if vt_reason not in result.get("reasons", []):
            result.setdefault("reasons", []).append(vt_reason)

    # Re-classify label after VT boost
    current_label = _reclassify(after_vt_confidence, current_label)

    # ── Layer 4: Gemini AI deep threat explanation ────────────────────────
    # Only for non-safe results — saves Gemini quota on clean URLs
    ai_result: Optional[dict] = None
    if current_label in ("PHISHING", "SUSPICIOUS"):
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
        except Exception as exc:
            logger.warning("Gemini threat explanation skipped: %s", exc)

    # ── Final merge ───────────────────────────────────────────────────────
    final_confidence = _apply_ai_boost(after_vt_confidence, ai_result)
    final_label      = _reclassify(final_confidence, current_label)

    result["label"]             = final_label
    result["confidence"]        = final_confidence
    result["risk_score"]        = _build_risk_score_int(final_confidence)
    result["vt_result"]         = vt_result         # None when VT unavailable/skipped
    result["vt_used"]           = vt_result is not None
    result["threat_explanation"] = ai_result
    result["ai_analysis"]        = ai_result        # alias for API consistency
    result["ai_used"]            = ai_result is not None

    return result


def scan_url(url: str) -> dict:
    """
    Synchronous entry point — wraps scan_url_async.
    Used by file_service background tasks and any sync callers.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(asyncio.run, scan_url_async(url))
                return future.result(timeout=30)
        else:
            return loop.run_until_complete(scan_url_async(url))
    except Exception as exc:
        logger.warning("scan_url async dispatch failed, falling back to sync core: %s", exc)
        try:
            result = _core.predict_url(url.strip())
            result["risk_score"]          = _build_risk_score_int(result.get("confidence", 0.0))
            result["vt_result"]           = None
            result["vt_used"]             = False
            result["threat_explanation"]  = None
            result["ai_analysis"]         = None
            result["ai_used"]             = False
            return result
        except RuntimeError as e:
            logger.error("URL scan failed: %s", e)
            return {
                "label":              "SAFE",
                "confidence":         0.0,
                "risk_score":         0,
                "reasons":            ["Model not available — scan inconclusive"],
                "detection_mode":     "error",
                "vt_result":          None,
                "vt_used":            False,
                "threat_explanation": None,
                "ai_analysis":        None,
                "ai_used":            False,
            }

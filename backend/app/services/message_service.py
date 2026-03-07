"""
SMS / Message Fraud Detection Service
Wraps sms_detector_core.py into a reusable service.
"""
import logging
from typing import Optional
from app.services import sms_detector_core as _core

logger = logging.getLogger(__name__)


def scan_message(text: str) -> dict:
    """
    Scan a text message for fraud / phishing patterns.

    Returns the raw result dict from sms_detector_core.detect(), which includes:
        {
            "original_message": str,
            "language": str,
            "rule_score": float,
            "reasons": list[str],
            "final_score": float,
            "final_label": "FRAUD" | "SUSPICIOUS" | "SAFE",
            "confidence_level": str,
            "api_label": str,
            "api_confidence": float,
            "api_explanation": str,
            "api_skipped": bool,
            "api_error": str | None,
        }
    """
    try:
        result = _core.detect(text.strip())
        return result
    except Exception as e:
        logger.error(f"Message scan error: {e}")
        return {
            "original_message": text,
            "language": "unknown",
            "rule_score": 0.0,
            "reasons": [f"Scan error: {str(e)}"],
            "final_score": 0.0,
            "final_label": "SAFE",
            "confidence_level": "low",
            "api_label": "SAFE",
            "api_confidence": 0.0,
            "api_explanation": "",
            "api_skipped": True,
            "api_error": str(e),
        }

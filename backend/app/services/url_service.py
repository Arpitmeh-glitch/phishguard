"""
URL Phishing Detection Service
Wraps url_detector_core.py into a reusable async service.
"""
import logging
from typing import Optional
from app.services import url_detector_core as _core

logger = logging.getLogger(__name__)

# Module-level model reference
_initialized = False


def initialize() -> None:
    """Load or train the RandomForest model. Call once at startup."""
    global _initialized
    if _initialized:
        return
    try:
        model = _core.load_or_train_model()
        _core.set_model(model)
        _initialized = True
        logger.info("✅ URL detection model initialized")
    except Exception as e:
        logger.warning(f"⚠ URL model init failed (may need datasets): {e}")
        # Allow app to start without model — scans will fail gracefully
        _initialized = True


def scan_url(url: str) -> dict:
    """
    Scan a URL for phishing indicators.
    
    Returns:
        {
            "label": "PHISHING" | "SAFE",
            "confidence": float,
            "reasons": list[str],
            "detection_mode": str
        }
    """
    if not _initialized:
        initialize()

    try:
        result = _core.predict_url(url.strip())
        return result
    except RuntimeError as e:
        # Model not loaded — return safe default with error flag
        logger.error(f"URL scan failed: {e}")
        return {
            "label": "SAFE",
            "confidence": 0.0,
            "reasons": ["Model not available — scan inconclusive"],
            "detection_mode": "error",
        }
    except Exception as e:
        logger.error(f"Unexpected URL scan error: {e}")
        raise

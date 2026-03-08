"""
Scan Routes — Hardened
========================
Security improvements vs original:

  [C4]  URL scheme validation — javascript:/data:/file: schemes rejected.
  [C5]  File scan rate limit reduced to 10/min (was 20/min same as URL).
  [C6]  SHA-256 hash logged per file upload for auditability.
  [H4]  File content validated via magic bytes (not just Content-Type header).
  [H2]  Input trimmed before passing to ML models.

Rate limits:
  - /scan/url     : 20/min per user
  - /scan/message : 20/min per user
  - /scan/file    :  5/min per user (heavier operation)
"""

import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User, Scan, ScanType, ScanLabel
from app.schemas.schemas import (
    URLScanRequest, URLScanResponse,
    MessageScanRequest, MessageScanResponse,
    FileScanResponse,
)
from app.security.auth import require_user
from app.services import url_service, message_service
from app.services.file_service import save_encrypted_file, process_file_scan
from app.utils.audit import log_action
from app.utils.url_validator import validate_url_scheme
from app.config import settings

from slowapi import Limiter

# ── Per-user rate limiter ─────────────────────────────────────────────────────
def _user_id_key(request: Request) -> str:
    user: User = getattr(request.state, "rate_limit_user", None)
    if user is not None:
        return f"user:{user.id}"
    return request.client.host or "unknown"


scan_limiter = Limiter(key_func=_user_id_key)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scan", tags=["Scanning"])


def _inject_user_for_rate_limit(request: Request, current_user: User = Depends(require_user)) -> User:
    request.state.rate_limit_user = current_user
    return current_user


# ─────────────────────────────────────────────────────────────────────────────
# URL Scan
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/url", response_model=URLScanResponse)
@scan_limiter.limit("20/minute")
async def scan_url(
    request: Request,
    payload: URLScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_inject_user_for_rate_limit),
):
    """
    Scan a URL for phishing indicators.
    - Rate-limited to 20/min per user.
    - [C4] Rejects javascript:, data:, file:, and other non-http(s) schemes.
    """
    # [C4] Validate scheme before any processing
    safe_url = validate_url_scheme(payload.url)

    result = await url_service.scan_url_async(safe_url)

    label_map = {"PHISHING": ScanLabel.phishing, "SAFE": ScanLabel.safe}
    scan = Scan(
        user_id=current_user.id,
        scan_type=ScanType.url,
        input_data=safe_url[:2048],
        label=label_map.get(result["label"], ScanLabel.safe),
        confidence=result["confidence"],
        reasons=json.dumps(result.get("reasons", [])),
        detection_mode=result.get("detection_mode"),
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    log_action(
        db, "scan.url",
        user_id=str(current_user.id),
        resource="scan", resource_id=str(scan.id),
        ip_address=request.client.host,
        details={"label": result["label"], "confidence": result["confidence"]},
    )

    return URLScanResponse(
        scan_id=scan.id,
        label=result["label"],
        confidence=result["confidence"],
        risk_score=result.get("risk_score", 0),
        reasons=result.get("reasons", []),
        detection_mode=result.get("detection_mode", "unknown"),
        ai_analysis=result.get("ai_analysis"),
        threat_explanation=result.get("threat_explanation"),
        vt_result=result.get("vt_result"),
        created_at=scan.created_at,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Message Scan
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/message", response_model=MessageScanResponse)
@scan_limiter.limit("20/minute")
async def scan_message(
    request: Request,
    payload: MessageScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_inject_user_for_rate_limit),
):
    """Scan a text message for fraud patterns. Rate-limited to 20/min per user."""
    result = await message_service.scan_message_async(payload.message.strip())

    fl = result.get("final_label", "SAFE")
    label_map = {
        "FRAUD": ScanLabel.fraud,
        "SUSPICIOUS": ScanLabel.suspicious,
        "SAFE": ScanLabel.safe,
    }

    scan = Scan(
        user_id=current_user.id,
        scan_type=ScanType.message,
        input_data=payload.message[:5000],
        label=label_map.get(fl, ScanLabel.safe),
        confidence=result.get("final_score", 0.0),
        reasons=json.dumps(result.get("reasons", [])),
        rule_score=result.get("rule_score"),
        final_score=result.get("final_score"),
        language=result.get("language"),
        api_used=not result.get("api_skipped", True),
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    log_action(
        db, "scan.message",
        user_id=str(current_user.id),
        resource="scan", resource_id=str(scan.id),
        ip_address=request.client.host,
        details={"label": fl, "score": result.get("final_score")},
    )

    return MessageScanResponse(
        scan_id=scan.id,
        label=fl,
        final_score=result.get("final_score", 0.0),
        rule_score=result.get("rule_score", 0.0),
        confidence_level=result.get("confidence_level", "low"),
        risk_score=result.get("risk_score", 0),
        reasons=result.get("reasons", []),
        language=result.get("language", "unknown"),
        api_used=not result.get("api_skipped", True),
        ai_analysis=result.get("ai_analysis"),
        created_at=scan.created_at,
    )


# ─────────────────────────────────────────────────────────────────────────────
# File Scan
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/file", response_model=FileScanResponse)
@scan_limiter.limit("5/minute")      # [C5] Lower limit — heavier operation
async def scan_file(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(_inject_user_for_rate_limit),
):
    """
    Upload and scan a file for embedded phishing URLs and fraud messages.
    - Rate-limited to 5/min per user (CPU-intensive background job).
    - [H4] Magic-byte content validation (not just Content-Type header).
    - [C6] SHA-256 hash logged for auditability.
    - Max file size: 10 MB.
    """
    try:
        file_record, sha256 = await save_encrypted_file(file, str(current_user.id), db)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected error saving uploaded file: %s", exc, exc_info=True)
        raise HTTPException(status_code=400, detail="File processing failed")

    background_tasks.add_task(
        process_file_scan,
        str(file_record.id),
        str(current_user.id),
        db,
    )

    log_action(
        db, "scan.file",
        user_id=str(current_user.id),
        resource="file", resource_id=str(file_record.id),
        ip_address=request.client.host,
        details={
            "filename": file.filename,
            "size": file_record.file_size,
            "sha256": sha256[:16] + "...",   # partial hash — not full to save space
        },
    )

    return FileScanResponse(
        file_id=file_record.id,
        filename=file.filename,
        status="processing",
        message="File uploaded successfully. Background scan has started.",
    )

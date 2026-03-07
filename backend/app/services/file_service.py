"""
File Upload & Scanning Service — Hardened
==========================================
Security improvements vs original:

  [H4] Two-layer file validation:
       - Layer 1: MIME type check (from Content-Type header)
       - Layer 2: Magic bytes verification (reads actual file bytes)
  [C6] SHA-256 hash computed and returned for audit logging.

Files are never executed — content is read as bytes, decoded as UTF-8,
and regex-searched for URLs and message text only.
"""

import os
import re
import uuid
import logging
import json
from datetime import datetime
from pathlib import Path
from uuid import UUID
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import FileUpload, Scan, ScanType, ScanLabel
from app.utils.encryption import encrypt_file, decrypt_file
from app.utils.file_validator import validate_file_content, ALLOWED_MIME_TYPES
from app.services import url_service, message_service

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = settings.MAX_FILE_SIZE_MB * 1024 * 1024


async def save_encrypted_file(
    file: UploadFile,
    user_id: str,
    db: Session,
) -> tuple[FileUpload, str]:
    """
    Validate, encrypt, and store uploaded file.

    Returns:
        Tuple of (FileUpload DB record, sha256_hex)

    Security:
        - MIME type checked against allowlist.
        - Magic bytes verified (prevents Content-Type spoofing).
        - SHA-256 computed for audit trail.
        - File content never executed.
    """
    # Read content first so we can validate before writing anything
    content = await file.read()

    # Size check
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {settings.MAX_FILE_SIZE_MB}MB",
        )

    if len(content) == 0:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    # [H4] Two-layer content validation (MIME + magic bytes) + [C6] SHA-256
    sha256, detected_type = validate_file_content(
        content=content,
        declared_mime=file.content_type or "application/octet-stream",
        filename=file.filename or "unknown",
    )

    # Encrypt and store
    encrypted_data, iv_hex = encrypt_file(content)

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_filename = f"{uuid.uuid4()}.enc"
    stored_path = upload_dir / stored_filename

    with open(stored_path, "wb") as f:
        f.write(encrypted_data)

    # DB record — user_id must be uuid.UUID for UUID(as_uuid=True) column
    record = FileUpload(
        user_id=UUID(user_id),
        original_filename=file.filename or "unknown",
        stored_filename=stored_filename,
        file_size=len(content),
        mime_type=file.content_type or "application/octet-stream",
        encryption_iv=iv_hex,
        scan_status="pending",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return record, sha256


def process_file_scan(file_id: str, user_id: str, db: Session) -> None:
    """
    Background task: decrypt file, extract URLs & messages, scan each one.
    File content is NEVER executed — only read and regex-searched.
    """
    user_uuid = UUID(user_id)
    file_record = db.query(FileUpload).filter(FileUpload.id == UUID(file_id)).first()
    if not file_record:
        return

    try:
        file_record.scan_status = "processing"
        db.commit()

        stored_path = Path(settings.UPLOAD_DIR) / file_record.stored_filename
        with open(stored_path, "rb") as f:
            encrypted = f.read()
        content = decrypt_file(encrypted, file_record.encryption_iv)
        text = content.decode("utf-8", errors="ignore")

        # Extract URLs (regex only — no execution)
        url_pattern = re.compile(
            r"https?://[^\s\">'<,;)}\\]]+", re.IGNORECASE
        )
        urls = list(set(url_pattern.findall(text)))

        # Extract sentences (split on newlines/sentence ends, cap at 50)
        messages = [
            line.strip() for line in re.split(r"[\n.!?]", text)
            if len(line.strip()) > 20
        ][:50]

        threats = 0

        # Scan URLs (cap at 100)
        for url in urls[:100]:
            try:
                result = url_service.scan_url(url)
                label = ScanLabel.phishing if result["label"] == "PHISHING" else ScanLabel.safe
                if label == ScanLabel.phishing:
                    threats += 1
                scan = Scan(
                    user_id=user_uuid,
                    scan_type=ScanType.url,
                    input_data=url[:2048],
                    label=label,
                    confidence=result.get("confidence", 0.0),
                    reasons=json.dumps(result.get("reasons", [])),
                    detection_mode=result.get("detection_mode"),
                )
                db.add(scan)
            except Exception as e:
                logger.error(f"URL scan error in file processor: {e}")

        # Scan messages
        for msg in messages:
            try:
                result = message_service.scan_message(msg)
                fl = result.get("final_label", "SAFE")
                label_map = {
                    "FRAUD": ScanLabel.fraud,
                    "SUSPICIOUS": ScanLabel.suspicious,
                    "SAFE": ScanLabel.safe,
                }
                label = label_map.get(fl, ScanLabel.safe)
                if label in (ScanLabel.fraud, ScanLabel.suspicious):
                    threats += 1
                scan = Scan(
                    user_id=user_uuid,
                    scan_type=ScanType.message,
                    input_data=msg[:5000],
                    label=label,
                    confidence=result.get("final_score", 0.0),
                    reasons=json.dumps(result.get("reasons", [])),
                    rule_score=result.get("rule_score"),
                    final_score=result.get("final_score"),
                    language=result.get("language"),
                    api_used=not result.get("api_skipped", True),
                )
                db.add(scan)
            except Exception as e:
                logger.error(f"Message scan error in file processor: {e}")

        file_record.urls_found     = len(urls)
        file_record.messages_found = len(messages)
        file_record.threats_found  = threats
        file_record.scan_status    = "done"
        file_record.scanned_at     = datetime.utcnow()
        db.commit()

    except Exception as e:
        logger.error(f"File scan failed for {file_id}: {e}")
        file_record.scan_status = "error"
        db.commit()

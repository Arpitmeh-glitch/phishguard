"""
File Upload & Scanning Service — Enhanced
==========================================
Improvements:
  - Deep content analysis for PDF, DOCX, XLSX, ZIP, TXT, HTML
  - Suspicious extension detection
  - Macro-enabled document detection
  - Embedded URL extraction
  - Suspicious keyword scanning
  - Base64 payload detection
  - Known malicious pattern matching
  - Classification: Safe / Suspicious / Potentially Dangerous
"""

import os
import re
import uuid
import logging
import json
import math
import zipfile
import io
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

# ── Suspicious patterns ───────────────────────────────────────────────────────
SUSPICIOUS_KEYWORDS = [
    "password", "passwd", "credential", "secret", "api_key", "apikey",
    "token", "private_key", "ssh_key", "bank", "account", "ssn", "social security",
    "credit card", "cvv", "pin", "login", "signin", "verify your account",
    "click here", "urgent", "suspended", "verify now", "confirm your",
    "wire transfer", "bitcoin", "crypto", "lottery", "winner", "prize",
    "paypal", "western union", "moneygram", "inheritance",
]

DANGEROUS_EXTENSIONS_IN_ZIP = {
    ".exe", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jar",
    ".msi", ".scr", ".com", ".pif", ".reg", ".lnk", ".sh",
}

SUSPICIOUS_HTML_PATTERNS = [
    r"eval\s*\(",
    r"document\.write\s*\(",
    r"unescape\s*\(",
    r"window\.location\s*=",
    r"<iframe[^>]*src",
    r"javascript\s*:",
    r"vbscript\s*:",
    r"onload\s*=",
    r"onerror\s*=",
]

# Regex for URLs
URL_RE = re.compile(r"https?://[^\s\">'<,;)}\\\]]+", re.IGNORECASE)

# Base64 payload detection (long base64 strings > 200 chars)
BASE64_RE = re.compile(r"[A-Za-z0-9+/]{200,}={0,2}")


def _entropy(data: bytes) -> float:
    """Shannon entropy of byte sequence."""
    if not data:
        return 0.0
    freq = [0] * 256
    for b in data:
        freq[b] += 1
    n = len(data)
    ent = 0.0
    for f in freq:
        if f:
            p = f / n
            ent -= p * math.log2(p)
    return ent


def _analyze_content(content: bytes, filename: str) -> dict:
    """
    Deep content analysis. Returns a dict with:
      - urls: list[str]
      - messages: list[str]
      - findings: list[str]  (human-readable threat findings)
      - risk_level: "safe" | "suspicious" | "dangerous"
    """
    findings = []
    urls = []
    messages = []
    ext = Path(filename).suffix.lower()

    text = ""

    # ── PDF extraction ──────────────────────────────────────────────────────
    if content[:4] == b"%PDF" or ext == ".pdf":
        try:
            text = content.decode("latin-1", errors="ignore")
            # Check for JavaScript in PDF
            if "/JavaScript" in text or "/JS " in text:
                findings.append("PDF contains embedded JavaScript — high risk")
            if "/Launch" in text:
                findings.append("PDF contains /Launch action — can execute files")
            if "/OpenAction" in text:
                findings.append("PDF has auto-open action")
            if "/EmbeddedFile" in text:
                findings.append("PDF contains embedded file(s)")
            if "/URI" in text:
                findings.append("PDF contains URI/link objects")
            # Decode any hex-encoded strings for URL extraction
            hex_decoded = re.sub(
                r"<([0-9a-fA-F]+)>",
                lambda m: bytes.fromhex(m.group(1)).decode("latin-1", errors="ignore"),
                text,
            )
            text = text + " " + hex_decoded
        except Exception as e:
            logger.debug(f"PDF parse error: {e}")

    # ── ZIP / DOCX / XLSX extraction ────────────────────────────────────────
    elif content[:4] == b"PK\x03\x04" or ext in (".zip", ".docx", ".xlsx"):
        try:
            zf = zipfile.ZipFile(io.BytesIO(content))
            names = zf.namelist()

            # Check for dangerous extensions inside ZIP
            for name in names:
                inner_ext = Path(name).suffix.lower()
                if inner_ext in DANGEROUS_EXTENSIONS_IN_ZIP:
                    findings.append(f"ZIP contains executable: {name}")

            # Check for macro files in DOCX/XLSX
            macro_files = [n for n in names if "vbaProject" in n or n.endswith(".bin")]
            if macro_files:
                findings.append(f"Document contains macros (VBA): {', '.join(macro_files)}")

            # Extract text from XML content files
            text_parts = []
            for name in names:
                if name.endswith(".xml") or name.endswith(".rels"):
                    try:
                        raw = zf.read(name).decode("utf-8", errors="ignore")
                        # Strip XML tags for text analysis
                        stripped = re.sub(r"<[^>]+>", " ", raw)
                        text_parts.append(stripped)
                    except Exception:
                        pass
            text = " ".join(text_parts)
        except zipfile.BadZipFile:
            findings.append("File claims to be ZIP/DOCX/XLSX but has invalid ZIP structure")
        except Exception as e:
            logger.debug(f"ZIP/Office parse error: {e}")

    # ── HTML analysis ────────────────────────────────────────────────────────
    elif ext in (".html", ".htm") or b"<html" in content[:100].lower():
        text = content.decode("utf-8", errors="ignore")
        for pattern in SUSPICIOUS_HTML_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                findings.append(f"Suspicious HTML pattern: {pattern}")

    # ── Plain text / CSV / JSON ──────────────────────────────────────────────
    else:
        text = content.decode("utf-8", errors="ignore")

    # ── Universal checks on extracted text ──────────────────────────────────

    # URL extraction
    urls = list(set(URL_RE.findall(text)))

    # Sentence extraction
    messages = [
        line.strip() for line in re.split(r"[\n.!?]", text)
        if len(line.strip()) > 20
    ][:50]

    # Suspicious keyword scan
    text_lower = text.lower()
    found_keywords = [kw for kw in SUSPICIOUS_KEYWORDS if kw in text_lower]
    if len(found_keywords) >= 3:
        findings.append(f"Multiple suspicious keywords found: {', '.join(found_keywords[:5])}")
    elif found_keywords:
        findings.append(f"Suspicious keywords found: {', '.join(found_keywords)}")

    # Base64 payload detection
    b64_matches = BASE64_RE.findall(text)
    if len(b64_matches) > 2:
        findings.append(f"Multiple large base64-encoded payloads detected ({len(b64_matches)} found)")
    elif b64_matches:
        findings.append("Base64-encoded payload detected in content")

    # High entropy detection (potential obfuscation)
    sample = content[:4096]
    ent = _entropy(sample)
    if ent > 7.2:
        findings.append(f"High entropy content ({ent:.2f}/8.0) — possible encryption/obfuscation")

    # Determine risk level
    dangerous_keywords = ["contains executable", "contains macros", "JavaScript", "/Launch", "BadZipFile"]
    if any(any(dk in f for dk in dangerous_keywords) for f in findings):
        risk_level = "dangerous"
    elif findings:
        risk_level = "suspicious"
    else:
        risk_level = "safe"

    return {
        "urls": urls,
        "messages": messages,
        "findings": findings,
        "risk_level": risk_level,
    }


async def save_encrypted_file(
    file: UploadFile,
    user_id: str,
    db: Session,
) -> tuple[FileUpload, str]:
    """
    Validate, encrypt, and store uploaded file.
    Returns (FileUpload DB record, sha256_hex).
    """
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {settings.MAX_FILE_SIZE_MB}MB",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    sha256, detected_type = validate_file_content(
        content=content,
        declared_mime=file.content_type or "application/octet-stream",
        filename=file.filename or "unknown",
    )

    encrypted_data, iv_hex = encrypt_file(content)

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_filename = f"{uuid.uuid4()}.enc"
    stored_path = upload_dir / stored_filename

    with open(stored_path, "wb") as f:
        f.write(encrypted_data)

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
    Background task: decrypt file, deep-analyze, scan URLs and messages.
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

        # Deep content analysis
        analysis = _analyze_content(content, file_record.original_filename)
        urls = analysis["urls"]
        messages = analysis["messages"]
        findings = analysis["findings"]
        risk_level = analysis["risk_level"]

        threats = 0

        # Log file-level findings as a meta-scan
        if findings:
            label = ScanLabel.phishing if risk_level == "dangerous" else ScanLabel.suspicious
            threats += 1
            meta_scan = Scan(
                user_id=user_uuid,
                scan_type=ScanType.url,  # use as general scan type
                input_data=f"[FILE ANALYSIS] {file_record.original_filename}",
                label=label,
                confidence=0.9 if risk_level == "dangerous" else 0.6,
                reasons=json.dumps(findings),
                detection_mode="file_deep_analysis",
            )
            db.add(meta_scan)

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

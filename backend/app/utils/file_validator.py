"""
File Upload Validator
======================
Two-layer validation for uploaded files:

Layer 1 — MIME type check (from client Content-Type header)
Layer 2 — Magic bytes verification (reads first 16 bytes of file content)
           This catches files where the client lies about Content-Type.

Also computes SHA-256 hash for:
  - Duplicate detection
  - Future threat intelligence lookups
  - Audit trail enrichment

Known-malicious hash list is intentionally empty in OSS build.
In production, populate KNOWN_MALICIOUS_HASHES from a threat feed.
"""

import hashlib
import logging
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

# ── Allowed MIME types ────────────────────────────────────────────────────────
ALLOWED_MIME_TYPES = frozenset({
    "text/plain",
    "text/html",
    "text/csv",
    "application/json",
    "application/xml",
    "text/xml",
    "message/rfc822",   # .eml email files
})

# ── Magic bytes → (description, allowed) ─────────────────────────────────────
# Maps the first N bytes of a file to its real type.
# If the magic bytes match a known dangerous format, the upload is rejected
# regardless of what the client claims the Content-Type is.
_MAGIC_BLOCKS: list[tuple[bytes, str, bool]] = [
    # Executables / dangerous
    (b"MZ",                   "PE executable (EXE/DLL)",       False),
    (b"\x7fELF",              "ELF executable",                 False),
    (b"\xca\xfe\xba\xbe",    "Mach-O executable",              False),
    (b"\xfe\xed\xfa\xce",    "Mach-O executable",              False),
    (b"\xfe\xed\xfa\xcf",    "Mach-O 64-bit executable",       False),
    (b"#!/",                  "Shell script",                   False),
    (b"#!",                   "Script file",                    False),
    (b"%!PS",                 "PostScript",                     False),
    # Archives that could contain executables
    (b"PK\x03\x04",          "ZIP archive",                    False),
    (b"PK\x05\x06",          "ZIP archive (empty)",            False),
    (b"\x1f\x8b",            "Gzip archive",                   False),
    (b"BZh",                  "Bzip2 archive",                  False),
    (b"\xfd7zXZ\x00",        "XZ archive",                     False),
    (b"Rar!",                 "RAR archive",                    False),
    (b"7z\xbc\xaf'",         "7-Zip archive",                  False),
    # Office documents (can contain macros — reject)
    (b"\xd0\xcf\x11\xe0",   "MS Office legacy (OLE2)",        False),
    # PDFs — text content only, reject binary PDFs to be safe
    (b"%PDF",                 "PDF document",                   False),
    # Allowed text formats (sanity check)
    (b"\xef\xbb\xbf",        "UTF-8 BOM text",                 True),   # UTF-8 BOM
]

# ── Known-malicious SHA-256 hashes ────────────────────────────────────────────
# Populate from a threat feed in production.
# Format: lowercase hex SHA-256 strings.
KNOWN_MALICIOUS_HASHES: frozenset[str] = frozenset()


def compute_sha256(content: bytes) -> str:
    """Return lowercase hex SHA-256 digest of file content."""
    return hashlib.sha256(content).hexdigest()


def validate_file_content(
    content: bytes,
    declared_mime: str,
    filename: str,
) -> tuple[str, str]:
    """
    Validate file content via magic bytes and check against known-malicious hashes.

    Args:
        content:       Raw file bytes.
        declared_mime: Content-Type from the client (first validation layer).
        filename:      Original filename (for logging/error messages).

    Returns:
        Tuple of (sha256_hex, detected_type_description)

    Raises:
        HTTPException(400): If file type is not allowed.
        HTTPException(400): If magic bytes indicate a dangerous file type.
        HTTPException(400): If SHA-256 matches a known-malicious hash.
    """
    # Layer 1: MIME type check
    if declared_mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"File type '{declared_mime}' is not permitted. "
                f"Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}"
            ),
        )

    # Layer 2: Magic bytes check
    header = content[:16]
    for magic, description, allowed in _MAGIC_BLOCKS:
        if header.startswith(magic):
            if not allowed:
                logger.warning(
                    f"Rejected file '{filename}' — magic bytes match: {description}"
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"File content does not match an allowed type. "
                        f"Detected: {description}. "
                        f"Only plain text, HTML, CSV, JSON, XML, and .eml files are accepted."
                    ),
                )

    # Layer 3: SHA-256 threat hash check
    sha256 = compute_sha256(content)
    if sha256 in KNOWN_MALICIOUS_HASHES:
        logger.warning(
            f"THREAT DETECTED — file '{filename}' matches known-malicious hash: {sha256}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File matches a known malicious signature and cannot be processed.",
        )

    # Detect actual content type for logging
    detected = "text/unknown"
    for magic, description, _ in _MAGIC_BLOCKS:
        if header.startswith(magic):
            detected = description
            break

    logger.info(f"File '{filename}' passed validation — SHA-256: {sha256[:12]}...")
    return sha256, detected

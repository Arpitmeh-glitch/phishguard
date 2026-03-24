"""
improved_file_detector.py
==========================
Enhanced file phishing/malware detector.

Improvements over file_service.py:
  1. Layered extension scoring (double-extension, suspicious TLD-like extensions)
  2. Magic-byte validation: extension vs actual file header consistency
  3. Filename heuristic scoring (urgency words, brand names, lure patterns)
  4. Script/macro keyword detection in content
  5. Embedded URL extraction + scoring
  6. Entropy analysis (configurable per-format)
  7. Structured risk scoring with per-category breakdown
  8. No network I/O required
"""

import re
import math
import os

# ── Extension risk tiers ───────────────────────────────────────────────────────
DANGEROUS_EXTENSIONS = {
    ".exe", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jar",
    ".msi", ".scr", ".com", ".pif", ".reg", ".lnk", ".sh", ".hta",
    ".wsf", ".jse", ".vbe", ".cpl", ".inf",
}

SUSPICIOUS_EXTENSIONS = {
    ".apk", ".dmg", ".pkg", ".iso", ".img", ".bin",
    ".py", ".rb", ".pl", ".php",          # scripts that shouldn't arrive as downloads
}

SAFE_EXTENSIONS = {
    ".pdf", ".docx", ".xlsx", ".pptx", ".csv", ".txt", ".md",
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
    ".zip", ".tar", ".gz",               # containers — need content check too
}

# ── Double-extension detection ────────────────────────────────────────────────
# e.g. "invoice.pdf.exe" or "photo.jpg.bat"
DOUBLE_EXT_PATTERN = re.compile(
    r"\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif|txt|csv|zip)"
    r"\.(exe|bat|cmd|vbs|js|ps1|scr|msi|jar|hta)\s*$",
    re.IGNORECASE
)

# ── Magic bytes for common types ──────────────────────────────────────────────
MAGIC_BYTES = {
    b"\x4D\x5A":         "Windows PE Executable (.exe/.dll)",
    b"\x7FELF":          "Linux ELF Executable",
    b"\xCA\xFE\xBA\xBE": "Java Class File (.class/.jar header)",
    b"\xD0\xCF\x11\xE0": "Legacy Office Document (.doc/.xls/.ppt)",
    b"\x25\x50\x44\x46": "PDF Document",
    b"\x50\x4B\x03\x04": "ZIP/Office XML (.zip/.docx/.xlsx/.pptx)",
    b"\xFF\xD8\xFF":      "JPEG Image",
    b"\x89\x50\x4E\x47": "PNG Image",
    b"\x23\x21":          "Script with shebang (#!)",
    b"\x3C\x68\x74\x6D": "HTML Document",
    b"\x3C\x73\x63\x72": "Script tag / HTML",
}

# ── Filename lure patterns ────────────────────────────────────────────────────
FILENAME_LURE_PATTERNS = [
    (re.compile(r"\b(invoice|payment|receipt|statement|order)\b", re.I),
     0.25, "Financial document lure in filename"),
    (re.compile(r"\b(urgent|immediate|action\s*required|important)\b", re.I),
     0.35, "Urgency keyword in filename"),
    (re.compile(r"\b(prize|reward|winner|claim|gift|free)\b", re.I),
     0.40, "Prize/reward lure in filename"),
    (re.compile(r"\b(password|credentials?|login|bank|kyc|verify|secure)\b", re.I),
     0.30, "Credential/security keyword in filename"),
    (re.compile(r"\b(update|install|setup|patch|upgrade)\b", re.I),
     0.25, "Software installation lure in filename"),
    (re.compile(r"\b(paypal|amazon|microsoft|apple|google|netflix|ebay|sbi|hdfc|icici)\b", re.I),
     0.35, "Brand impersonation in filename"),
    (re.compile(r"\d{4,}", re.I),
     0.10, "Long numeric sequence in filename (common in auto-generated lures)"),
]

# ── Content keyword tiers ─────────────────────────────────────────────────────
HIGH_RISK_CONTENT_KW = {
    "cvv", "ssn", "social security", "wire transfer", "western union",
    "moneygram", "bitcoin", "cryptocurrency", "wallet address",
    "inheritance", "lottery winner", "prize claim", "verify your bank",
    "send your otp", "enter your password", "click here to claim",
}

MEDIUM_RISK_CONTENT_KW = {
    "verify your account", "suspended", "verify now", "confirm your details",
    "click here", "urgent action", "paypal", "credit card number",
    "bank account number", "login credential",
}

SCRIPT_INDICATORS = {
    "eval(", "document.write(", "unescape(", "window.location=",
    "<iframe", "javascript:", "vbscript:", "onload=", "onerror=",
    "powershell", "cmd.exe", "reg add", "wscript.shell", "shell.application",
    "createobject", "autoopen", "auto_open", "document_open",
    "application.run", "shell(", "exec(", "os.system(",
}

MACRO_INDICATORS = {
    "vba", "macro", "autoopen", "auto_open", "document_open",
    "workbook_open", "shell(", "createobject", "wscript",
    "macro-enabled", "xlsm", "xlam", "dotm", "docm",
}

URL_PATTERN = re.compile(r"https?://[^\s\">'<,;)}\\\]]+", re.IGNORECASE)

# ── High-entropy formats (skip entropy check) ─────────────────────────────────
HIGH_ENTROPY_FORMATS = {".zip", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg",
                         ".png", ".pdf", ".enc", ".gz", ".7z"}


def _entropy(data: bytes) -> float:
    if not data: return 0.0
    freq = [0] * 256
    for b in data: freq[b] += 1
    n = len(data)
    return -sum((v/n)*math.log2(v/n) for v in freq if v > 0)


def _detect_magic_type(content: bytes) -> str | None:
    for magic, label in MAGIC_BYTES.items():
        if content.startswith(magic):
            return label
    return None


def _score_filename(filename: str) -> tuple[float, list[str]]:
    reasons = []
    score   = 0.0
    name_lower = filename.lower()

    # Double extension (always high risk)
    if DOUBLE_EXT_PATTERN.search(filename):
        score += 0.75
        reasons.append(f"Double extension trick detected in filename: '{filename}'")

    # Extension tier — checked FIRST, independently of content
    _, ext = os.path.splitext(name_lower)
    if ext in DANGEROUS_EXTENSIONS:
        score += 0.65   # raised from 0.60 to ensure DANGEROUS on extension alone
        reasons.append(f"Dangerous file extension: '{ext}'")
    elif ext in SUSPICIOUS_EXTENSIONS:
        score += 0.35
        reasons.append(f"Suspicious file extension: '{ext}'")

    # Lure patterns
    for pattern, pts, reason in FILENAME_LURE_PATTERNS:
        if pattern.search(name_lower):
            score += pts
            reasons.append(reason)

    return min(score, 1.0), reasons


def _score_content(filename: str, content: bytes) -> tuple[float, list[str]]:
    reasons = []
    score   = 0.0
    _, ext  = os.path.splitext(filename.lower())

    # Magic byte vs extension mismatch
    detected_type = _detect_magic_type(content)
    if detected_type:
        is_pe = "PE Executable" in detected_type or "ELF" in detected_type
        if is_pe and ext not in {".exe", ".dll", ".com", ".scr"}:
            score += 0.70
            reasons.append(
                f"MAGIC MISMATCH: File has PE/ELF header but extension is '{ext}' — disguised executable"
            )

    # Entropy check (skip for inherently high-entropy formats)
    if ext not in HIGH_ENTROPY_FORMATS and len(content) > 100:
        ent = _entropy(content[:4096])
        if ent > 7.5:
            score += 0.35
            reasons.append(f"Very high byte entropy ({ent:.2f}/8.00) — possible packed/encrypted payload")
        elif ent > 7.0:
            score += 0.15

    # Text-based content analysis
    try:
        text = content.decode("utf-8", errors="replace").lower()
    except Exception:
        text = ""

    # Script/macro indicators
    found_script = [kw for kw in SCRIPT_INDICATORS if kw in text]
    if found_script:
        score += min(len(found_script) * 0.18, 0.60)
        reasons.append(f"Script/macro indicators found: {', '.join(found_script[:4])}")

    # Macro keywords in office files
    if ext in {".docx", ".xlsx", ".pptx", ".doc", ".xls"}:
        found_macros = [kw for kw in MACRO_INDICATORS if kw in text]
        if found_macros:
            score += min(len(found_macros) * 0.15, 0.45)
            reasons.append(f"Macro keywords in Office file: {', '.join(found_macros[:3])}")

    # High-risk content keywords
    found_high = [kw for kw in HIGH_RISK_CONTENT_KW if kw in text]
    if found_high:
        score += min(len(found_high) * 0.12, 0.40)
        reasons.append(f"High-risk content keywords: {', '.join(found_high[:3])}")

    # Medium-risk content keywords
    found_medium = [kw for kw in MEDIUM_RISK_CONTENT_KW if kw in text]
    if found_medium:
        score += min(len(found_medium) * 0.07, 0.20)
        if not found_high:  # avoid duplicate reason
            reasons.append(f"Phishing content keywords: {', '.join(found_medium[:3])}")

    # Embedded URLs
    urls = URL_PATTERN.findall(text)
    known_safe = ("google.com", "microsoft.com", "apple.com", "amazon.com",
                  "github.com", "stackoverflow.com")
    suspicious_urls = [u for u in urls if not any(s in u for s in known_safe)]
    if len(suspicious_urls) > 3:
        score += 0.25
        reasons.append(f"{len(suspicious_urls)} suspicious URLs embedded in file")
    elif suspicious_urls:
        score += 0.12
        reasons.append(f"Suspicious URL embedded: {suspicious_urls[0][:60]}")

    # Base64 payload detection
    base64_hits = re.findall(r"[A-Za-z0-9+/]{200,}={0,2}", text)
    if base64_hits:
        score += 0.30
        reasons.append(f"Large base64-encoded payload detected ({len(base64_hits)} block(s))")

    return min(score, 1.0), reasons


def scan_file(filename: str, content: bytes) -> dict:
    """
    Analyze a file and return a risk assessment.

    Returns:
        {
          "label":      "SAFE" | "SUSPICIOUS" | "DANGEROUS",
          "risk_score": float 0-1,
          "reasons":    list[str],
          "file_type":  str,
          "details":    dict
        }
    """
    fname_score, fname_reasons = _score_filename(filename)
    content_score, content_reasons = _score_content(filename, content)

    _, ext = os.path.splitext(filename.lower())

    # For clearly dangerous extensions, filename score alone is sufficient
    if ext in DANGEROUS_EXTENSIONS and fname_score >= 0.65:
        combined = fname_score
    elif ext in SUSPICIOUS_EXTENSIONS and fname_score >= 0.35:
        # Blend but weight filename higher
        combined = max(fname_score, (fname_score * 0.60) + (content_score * 0.40))
    else:
        # Combined score (filename 40%, content 60%)
        combined = (fname_score * 0.40) + (content_score * 0.60)
    combined = round(min(combined, 1.0), 4)

    all_reasons = fname_reasons + content_reasons
    # Deduplicate
    seen = set()
    unique_reasons = []
    for r in all_reasons:
        if r not in seen:
            seen.add(r)
            unique_reasons.append(r)

    detected_type = _detect_magic_type(content) or "Unknown"

    if combined >= 0.55:
        label = "DANGEROUS"
    elif combined >= 0.28:
        label = "SUSPICIOUS"
    else:
        label = "SAFE"

    return {
        "label":      label,
        "risk_score": combined,
        "reasons":    unique_reasons,
        "file_type":  detected_type,
        "details": {
            "filename_score":  round(fname_score, 4),
            "content_score":   round(content_score, 4),
            "filename_reasons": fname_reasons,
            "content_reasons":  content_reasons,
        }
    }

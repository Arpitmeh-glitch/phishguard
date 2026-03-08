"""
Live Threat Detection Service
================================
Simulates network traffic monitoring and threat analysis.

In a real deployment this would use:
  - scapy for packet capture
  - dnspython for DNS monitoring
  - psutil for network connection enumeration

For this implementation we provide:
  - A threat event model
  - Analysis rules (domain reputation, entropy, suspicious patterns)
  - An API that the frontend polls for live updates
"""

import re
import math
import hashlib
import logging
import random
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ── Known malicious domain patterns ─────────────────────────────────────────
MALICIOUS_DOMAIN_PATTERNS = [
    r"paypa[l1][-\.]",
    r"arnazon\.",
    r"g00gle\.",
    r"micros0ft\.",
    r"apple-id[-\.]",
    r"secure[-\.]login",
    r"account[-\.]verify",
    r"update[-\.]security",
    r"\.tk$", r"\.ml$", r"\.ga$", r"\.cf$",  # free TLDs abused for phishing
    r"bit\.ly", r"tinyurl\.com", r"t\.co",   # URL shorteners (suspicious in context)
]

SUSPICIOUS_PORTS = {20, 21, 23, 25, 110, 135, 139, 445, 1433, 3306, 3389, 4444, 6667, 6666}

SUSPICIOUS_KEYWORDS_IN_DOMAIN = [
    "login", "secure", "verify", "update", "account", "confirm",
    "bank", "paypal", "amazon", "google", "microsoft", "apple",
    "signin", "wallet", "crypto",
]


def _domain_entropy(domain: str) -> float:
    """Shannon entropy of a domain name string."""
    if not domain:
        return 0.0
    freq: dict[str, int] = {}
    for c in domain:
        freq[c] = freq.get(c, 0) + 1
    n = len(domain)
    return -sum((f / n) * math.log2(f / n) for f in freq.values() if f)


def analyze_domain(domain: str, port: Optional[int] = None) -> dict:
    """
    Analyze a domain/connection for threat indicators.

    Returns:
        {
          "domain": str,
          "risk_level": "safe" | "suspicious" | "dangerous",
          "reasons": list[str],
          "confidence": float,
        }
    """
    reasons = []
    risk_score = 0.0

    domain_lower = domain.lower().strip()
    # Strip port if present
    if ":" in domain_lower:
        domain_lower = domain_lower.split(":")[0]

    # 1. Known malicious patterns
    for pattern in MALICIOUS_DOMAIN_PATTERNS:
        if re.search(pattern, domain_lower):
            reasons.append(f"Matches known phishing pattern: {pattern}")
            risk_score += 0.5

    # 2. Suspicious keywords
    for kw in SUSPICIOUS_KEYWORDS_IN_DOMAIN:
        if kw in domain_lower:
            reasons.append(f"Domain contains suspicious keyword: '{kw}'")
            risk_score += 0.2
            break

    # 3. High entropy domain (DGA — domain generation algorithm)
    hostname = domain_lower.split(".")[0]
    ent = _domain_entropy(hostname)
    if ent > 3.8 and len(hostname) > 12:
        reasons.append(f"High entropy domain name (entropy={ent:.2f}) — possible DGA")
        risk_score += 0.35

    # 4. Suspicious port
    if port and port in SUSPICIOUS_PORTS:
        reasons.append(f"Connection on suspicious port {port}")
        risk_score += 0.3

    # 5. Excessive subdomains (domain impersonation)
    parts = domain_lower.split(".")
    if len(parts) > 4:
        reasons.append(f"Excessive subdomain depth ({len(parts)} levels) — possible impersonation")
        risk_score += 0.25

    # 6. Very long domain
    if len(domain_lower) > 60:
        reasons.append(f"Unusually long domain ({len(domain_lower)} chars)")
        risk_score += 0.15

    # Clamp
    risk_score = min(risk_score, 1.0)

    if risk_score >= 0.6:
        risk_level = "dangerous"
    elif risk_score >= 0.25:
        risk_level = "suspicious"
    else:
        risk_level = "safe"

    return {
        "domain": domain,
        "risk_level": risk_level,
        "reasons": reasons,
        "confidence": round(risk_score, 3),
    }


# ── Demo event generator (used when no real capture available) ───────────────
_DEMO_DOMAINS = [
    ("google.com",             80,   "safe"),
    ("cdn.jsdelivr.net",       443,  "safe"),
    ("api.github.com",         443,  "safe"),
    ("paypa1-secure-login.tk", 80,   "dangerous"),
    ("arnazon-update.ml",      443,  "dangerous"),
    ("xqzjmfkdlp.cf",          443,  "suspicious"),
    ("accounts.verify-secure.net", 443, "suspicious"),
    ("login.microsofft.com",   443,  "dangerous"),
    ("fonts.googleapis.com",   443,  "safe"),
    ("cdn.cloudflare.com",     443,  "safe"),
    ("update-account-apple.ga", 80,  "dangerous"),
    ("akamai.net",             443,  "safe"),
    ("analytics.google.com",   443,  "safe"),
    ("secure-bank-verify.tk",  80,   "dangerous"),
    ("npmjs.org",              443,  "safe"),
]


def generate_demo_events(count: int = 20) -> list[dict]:
    """Generate simulated threat detection events for demo purposes."""
    events = []
    now = datetime.utcnow()
    for i in range(count):
        domain, port, expected_risk = random.choice(_DEMO_DOMAINS)
        analysis = analyze_domain(domain, port)
        events.append({
            "id": hashlib.md5(f"{domain}{i}{now.isoformat()}".encode()).hexdigest()[:12],
            "domain": domain,
            "port": port,
            "risk_level": analysis["risk_level"],
            "reasons": analysis["reasons"],
            "confidence": analysis["confidence"],
            "timestamp": (now - timedelta(seconds=random.randint(0, 3600))).isoformat() + "Z",
            "protocol": "HTTPS" if port == 443 else "HTTP",
            "bytes_sent": random.randint(128, 8192),
            "bytes_recv": random.randint(512, 65536),
        })
    # Sort newest first
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    return events

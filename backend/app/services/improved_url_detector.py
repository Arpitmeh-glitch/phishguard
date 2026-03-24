

import re
import os
import csv
import math
import logging
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

logger = logging.getLogger(__name__)

# =============================================================================
# PATH RESOLUTION — production-safe absolute paths
# =============================================================================
# ALL path resolution is done relative to THIS file's location so the module
# works correctly regardless of the working directory at runtime (e.g. Docker,
# Gunicorn, uvicorn, pytest — they all set CWD differently).

_THIS_DIR = Path(__file__).resolve().parent   # …/app/services/

# Candidate locations searched in order; first existing file wins per name.
# Add new search roots here rather than touching _WHITELIST_CSV_PATHS directly.
_WHITELIST_CSV_PATHS = [
    # Standard project layout: backend/data/ next to the app/ package
    _THIS_DIR.parent / "data" / "top-1m.csv",
    _THIS_DIR.parent / "data" / "tranco_L6J4.csv",
    # One level further up (mono-repo root / backend / data)
    _THIS_DIR.parent.parent / "data" / "top-1m.csv",
    _THIS_DIR.parent.parent / "data" / "tranco_L6J4.csv",
    # Docker / production mount points
    Path("/app/data/top-1m.csv"),
    Path("/app/data/tranco_L6J4.csv"),
    Path("/data/top-1m.csv"),
    Path("/data/tranco_L6J4.csv"),
    # Legacy: files sitting directly beside this module (dev convenience)
    _THIS_DIR / "top-1m.csv",
    _THIS_DIR / "tranco_L6J4.csv",
]

# =============================================================================
# WHITELIST — loaded ONCE at module import (O(1) lookup via frozenset)
# =============================================================================

# Curated hard-coded whitelist — always present regardless of CSV availability.
_BUILTIN_WHITELIST = frozenset({
    "google.com", "googleapis.com", "gstatic.com", "gmail.com", "youtube.com",
    "amazon.com", "amazon.in", "amazon.co.uk", "amazon.de", "amazon.fr",
    "apple.com", "icloud.com", "microsoft.com", "live.com", "outlook.com",
    "office.com", "azure.com", "github.com", "github.io",
    "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com",
    "reddit.com", "netflix.com", "spotify.com", "dropbox.com",
    "paypal.com", "ebay.com", "chase.com", "wellsfargo.com", "bankofamerica.com",
    "sbi.co.in", "hdfcbank.com", "icicibank.com", "axisbank.com",
    "paytm.com", "phonepe.com", "stackoverflow.com", "wikipedia.org",
    "bbc.com", "cnn.com", "reuters.com", "nytimes.com", "arxiv.org",
    "coursera.org", "openai.com", "anthropic.com", "cloudflare.com",
    "yahoo.com", "hotmail.com", "protonmail.com",
    "stripe.com", "venmo.com", "cashapp.com",
    "w3.org", "mozilla.org", "letsencrypt.org",
    "flipkart.com", "walmart.com",
    "docs.python.org",
    "live.com", "microsoftonline.com", "sharepoint.com",
    "google.co.in", "google.co.uk",
})

# Known multi-part TLDs so apex extraction is correct
_MULTI_PART_TLDS = frozenset({
    "co.in", "co.uk", "co.jp", "co.nz", "co.za", "co.kr", "co.id",
    "com.au", "com.br", "com.mx", "com.sg", "com.hk", "com.ar",
    "net.in", "org.in", "gov.in", "ac.in",
    "net.au", "org.au", "or.jp", "ne.jp", "ac.jp",
})


def _load_csv_whitelist() -> set:
    """
    Load apex domains from Alexa Top-1M / Tranco CSV files.

    Supported formats:
        rank,domain   e.g.  "1,google.com"
        domain        e.g.  "google.com"

    Performance contract:
        Called ONCE at module-load time.
        Returns a plain set for O(1) membership testing.
        File I/O NEVER happens during detection.

    FIX: Paths are now resolved via Path(__file__).resolve() so they are
    absolute and correct regardless of CWD at runtime (the original
    os.path.join(__file__, "..", ...) produced relative paths that resolved
    differently in production vs local dev, causing the whitelist to silently
    load 0 entries and turning the CSV-loaded whitelist into a no-op).
    """
    loaded: set = set()
    files_attempted: list[str] = []
    files_loaded: list[str] = []

    for path in _WHITELIST_CSV_PATHS:
        resolved = path.resolve()
        if not resolved.is_file():
            continue
        files_attempted.append(str(resolved))
        try:
            with open(resolved, "r", encoding="utf-8", errors="replace") as fh:
                reader = csv.reader(fh)
                before = len(loaded)
                for row in reader:
                    if not row:
                        continue
                    domain = row[-1].strip().lower()
                    if domain and "." in domain:
                        loaded.add(domain)
            added = len(loaded) - before
            logger.info(
                "✅ Whitelist CSV loaded: %s  (+%d domains, running total: %d)",
                resolved, added, len(loaded),
            )
            files_loaded.append(str(resolved))
        except Exception as exc:
            # Log at WARNING so ops teams see it — this used to be silently swallowed
            logger.warning(
                "⚠️  Failed to load whitelist from %s: %s", resolved, exc
            )

    if not files_attempted:
        logger.warning(
            "⚠️  No whitelist CSV files found in any of the %d search paths. "
            "Detection will rely on the built-in whitelist (%d entries) only. "
            "To improve false-positive rates, place top-1m.csv or tranco_L6J4.csv "
            "in the backend/data/ directory.",
            len(_WHITELIST_CSV_PATHS),
            len(_BUILTIN_WHITELIST),
        )
    elif not files_loaded:
        logger.warning(
            "⚠️  Whitelist CSV files were found (%s) but all failed to parse. "
            "Detection falls back to built-in whitelist only.",
            files_attempted,
        )
    else:
        logger.info(
            "✅ Whitelist ready: %d CSV domains loaded from %d file(s)",
            len(loaded), len(files_loaded),
        )

    return loaded


# Load ONCE at module import
_CSV_WHITELIST: set = _load_csv_whitelist()

# Track whether CSVs were found for health-check diagnostics
_CSV_FILES_FOUND: bool = bool(_CSV_WHITELIST)

# Merged: CSV union built-in. All whitelist lookups use this.
DOMAIN_WHITELIST: frozenset = frozenset(_CSV_WHITELIST | _BUILTIN_WHITELIST)

logger.info(
    "🔐 URL detector whitelist finalised: %d total entries "
    "(%d from CSV, %d built-in)",
    len(DOMAIN_WHITELIST),
    len(_CSV_WHITELIST),
    len(_BUILTIN_WHITELIST),
)

# =============================================================================
# Detection constants (unchanged from v1 — backward compatible)
# =============================================================================

HOMOGLYPHS = str.maketrans({
    '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's',
    '@': 'a', '\u03bd': 'v', '\u0430': 'a', '\u0435': 'e', '\u043e': 'o',
    '\u0131': 'i', '\u1e37': 'l',
})

SUSPICIOUS_TLDS = {
    ".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".club", ".work",
    ".click", ".link", ".online", ".site", ".website", ".space", ".fun",
    ".loan", ".win", ".download", ".accountant", ".review", ".country",
    ".stream", ".gdn", ".bid", ".trade", ".cricket", ".science",
    ".zip", ".mov",
}

URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd",
    "buff.ly", "adf.ly", "short.link", "cutt.ly", "rb.gy", "shorturl.at",
    "tiny.cc", "shorte.st", "bc.vc", "clk.sh", "0rz.tw", "youtu.be",
}

BRAND_KEYWORDS = [
    "paypal", "amazon", "apple", "microsoft", "google", "facebook",
    "instagram", "netflix", "dropbox", "linkedin", "twitter", "ebay",
    "wellsfargo", "chase", "bankofamerica", "citibank", "barclays",
    "sbi", "hdfc", "icici", "kotak", "paytm", "phonepe", "gpay",
    "whatsapp", "telegram", "yahoo", "outlook", "office365",
]

TYPOSQUATTING_BRANDS = [
    "paypal", "amazon", "google", "microsoft", "facebook",
    "apple", "instagram", "linkedin", "netflix", "dropbox", "twitter",
]

COMBO_SUFFIXES = [
    "support", "secure", "update", "login", "signin", "verify", "account",
    "help", "service", "online", "web", "security", "alert", "notification",
    "billing", "payment", "checkout", "refund",
]

SENSITIVE_PATH_WORDS = [
    "login", "signin", "sign-in", "logon", "verify", "verification",
    "validate", "account", "update", "confirm", "secure", "security",
    "bank", "password", "passwd", "credential", "auth", "wallet",
    "payment", "checkout", "billing",
]

# =============================================================================
# Utility
# =============================================================================

def _levenshtein(a: str, b: str) -> int:
    if a == b: return 0
    if not a: return len(b)
    if not b: return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            curr.append(min(prev[j] + 1, curr[j-1] + 1, prev[j-1] + (ca != cb)))
        prev = curr
    return prev[-1]


def _shannon_entropy(s: str) -> float:
    if not s: return 0.0
    freq: dict = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    n = len(s)
    return -sum((v / n) * math.log2(v / n) for v in freq.values())


def _normalize(hostname: str) -> str:
    h = unquote(hostname).lower()
    return h.translate(HOMOGLYPHS)


def _get_apex(hostname: str) -> str:
    """
    Extract apex (registered) domain, correctly handling multi-part TLDs.

    Examples:
        mail.google.com     -> google.com
        www.sbi.co.in       -> sbi.co.in
        login.hdfc.co.in    -> hdfc.co.in
        evil.paypal-login.xyz -> paypal-login.xyz
    """
    parts = hostname.rstrip(".").split(".")
    if len(parts) < 2:
        return hostname
    if len(parts) >= 3:
        two_part_tld = ".".join(parts[-2:])
        if two_part_tld in _MULTI_PART_TLDS:
            return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _is_whitelisted(apex: str, full_hostname: str = "") -> bool:
    """
    Check if a domain is whitelisted.
    Also accepts subdomains of whitelisted apexes so that:
        outlook.live.com  -> live.com in whitelist -> True
        mail.google.com   -> google.com in whitelist -> True
    O(1) average — one direct lookup + optional parent lookup.
    """
    if apex in DOMAIN_WHITELIST:
        return True
    if full_hostname and full_hostname != apex:
        parts = full_hostname.rstrip(".").split(".")
        for i in range(1, len(parts) - 1):
            parent = ".".join(parts[i:])
            if parent in DOMAIN_WHITELIST:
                return True
    return False


# =============================================================================
# Feature extraction — 30 features (backward compatible)
# =============================================================================

def extract_features(url: str):
    """
    Extract 30 numeric features from a URL.
    Returns (features: list[float], reasons: list[str])
    """
    features = []
    reasons  = []
    url_lower = url.lower().strip()

    try:
        parsed   = urlparse(url_lower if url_lower.startswith("http") else "http://" + url_lower)
        hostname = (parsed.hostname or "").strip().lower().rstrip(".")
        if hostname.startswith("www."):
            hostname = hostname[4:]
        path  = parsed.path or ""
        query = parsed.query or ""
    except Exception:
        parsed   = None
        hostname = path = query = ""

    apex      = _get_apex(hostname)
    apex_name = apex.split(".")[0] if "." in apex else apex
    norm_apex = _normalize(apex_name)
    parts     = hostname.split(".")
    tld       = ("." + parts[-1]) if parts else ""

    # F0: URL length
    url_len = len(url)
    features.append(url_len)
    if url_len > 75:
        reasons.append(f"URL is unusually long ({url_len} chars)")

    # F1: Dot count
    dot_count = url.count(".")
    features.append(dot_count)
    if dot_count > 4:
        reasons.append(f"Excessive dot count ({dot_count})")

    # F2: Hyphen count in hostname
    hyphen_count = hostname.count("-")
    features.append(hyphen_count)
    if hyphen_count > 2:
        reasons.append(f"Many hyphens ({hyphen_count}) in domain")

    # F3: Has @ symbol
    has_at = int("@" in url)
    features.append(has_at)
    if has_at:
        reasons.append("'@' symbol hides real destination")

    # F4: IP as hostname
    has_ip = int(bool(re.search(r"(?<!\d)(\d{1,3}\.){3}\d{1,3}(?!\d)", hostname)))
    features.append(has_ip)
    if has_ip:
        reasons.append("Raw IP address used as hostname")

    # F5: HTTPS
    is_https = int(url_lower.startswith("https"))
    features.append(is_https)
    if not is_https:
        reasons.append("Not using HTTPS")

    # F6: Sensitive path words
    found_words = [w for w in SENSITIVE_PATH_WORDS if w in url_lower]
    features.append(len(found_words))
    if found_words:
        reasons.append(f"Sensitive keywords in URL: {', '.join(found_words[:3])}")

    # F7: Subdomain count
    subdomain_count = max(0, len(parts) - 2)
    features.append(subdomain_count)
    if subdomain_count > 2:
        reasons.append(f"Excessive subdomains ({subdomain_count})")

    # F8: Domain entropy
    entropy = round(_shannon_entropy(apex_name), 4)
    features.append(entropy)
    if entropy > 3.8:
        reasons.append(f"High domain entropy ({entropy:.2f}) — likely DGA domain")

    # F9: Suspicious TLD
    is_susp_tld = int(tld in SUSPICIOUS_TLDS)
    features.append(is_susp_tld)
    if is_susp_tld:
        reasons.append(f"Suspicious TLD '{tld}'")

    # F10: URL shortener
    is_shortener = int(apex in URL_SHORTENERS)
    features.append(is_shortener)
    if is_shortener:
        reasons.append("URL shortener masks true destination")

    # F11: Brand keyword outside apex
    found_brands = [b for b in BRAND_KEYWORDS if b in url_lower]
    apex_is_wl = _is_whitelisted(apex, full_hostname=hostname)
    brand_not_in_apex = int(
        bool(found_brands)
        and not any(b in apex for b in found_brands)
        and not apex_is_wl
    )
    features.append(brand_not_in_apex)
    if brand_not_in_apex:
        reasons.append(f"Brand '{found_brands[0]}' used outside legitimate domain — impersonation")

    # F12: Digit ratio in hostname
    digit_ratio = round(sum(c.isdigit() for c in hostname) / max(len(hostname), 1), 4)
    features.append(digit_ratio)
    if digit_ratio > 0.3:
        reasons.append(f"High digit ratio ({digit_ratio:.0%}) in domain")

    # F13: Special char ratio
    special_chars = sum(1 for c in url if c in "%=&?#~_;,")
    special_ratio = round(special_chars / max(len(url), 1), 4)
    features.append(special_ratio)
    if special_ratio > 0.15:
        reasons.append(f"High special-char ratio ({special_ratio:.0%})")

    # F14: Suspicious query params
    SUSP_PARAMS = {"redirect", "redir", "url", "next", "goto", "dest", "destination",
                   "return", "returnurl", "returnto", "target", "forward", "link", "ref"}
    try:
        qparams = set(parse_qs(query).keys())
        has_susp_params = int(bool(qparams & SUSP_PARAMS))
    except Exception:
        has_susp_params = 0
    features.append(has_susp_params)
    if has_susp_params:
        reasons.append("Suspicious redirect query parameters")

    # F15: Path depth
    path_depth = len([p for p in path.split("/") if p])
    features.append(path_depth)

    # F16: Double slash in path
    has_double_slash = int("//" in path)
    features.append(has_double_slash)
    if has_double_slash:
        reasons.append("Double slash in path — open redirect indicator")

    # F17: Punycode / IDN homograph
    has_punycode = int("xn--" in hostname)
    features.append(has_punycode)
    if has_punycode:
        reasons.append("Punycode IDN homograph detected")

    # F18: Non-standard port
    netloc = (parsed.netloc or "") if parsed else ""
    has_ns_port = int(
        bool(re.search(r":\d{2,5}", netloc))
        and not netloc.endswith((":80", ":443"))
    )
    features.append(has_ns_port)
    if has_ns_port:
        reasons.append("Non-standard port in URL")

    # F19: Embedded URL / redirect in path
    has_url_in_path = int("url=" in url_lower or bool(re.search(r"https?://", path)))
    features.append(has_url_in_path)
    if has_url_in_path:
        reasons.append("Embedded URL/redirect in path")

    # F20: TLD appearing mid-path
    tld_in_path = int(bool(re.search(r"\.(com|net|org|info|co|io)/", path)))
    features.append(tld_in_path)
    if tld_in_path:
        reasons.append("TLD token mid-path — domain confusion technique")

    # F21: Typosquatting
    typosquat_flag = 0
    for brand in TYPOSQUATTING_BRANDS:
        dist = _levenshtein(norm_apex, brand)
        if 0 < dist <= 2 and brand not in apex:
            typosquat_flag = 1
            reasons.append(f"Domain resembles '{brand}' (typosquatting, edit distance={dist})")
            break
    features.append(typosquat_flag)

    # F22: Combo-squatting (brand + action word in domain)
    combo_flag = 0
    for brand in BRAND_KEYWORDS:
        if brand in hostname:
            for suffix in COMBO_SUFFIXES:
                if suffix in hostname and brand not in apex:
                    combo_flag = 1
                    reasons.append(f"Combo-squatting: '{brand}+{suffix}' in domain")
                    break
        if combo_flag:
            break
    features.append(combo_flag)

    # F23: Hex/percent-encoded tokens in path
    hex_ratio = len(re.findall(r"%[0-9a-fA-F]{2}", url)) / max(len(url), 1)
    features.append(round(hex_ratio, 4))
    if hex_ratio > 0.05:
        reasons.append(f"Heavy percent-encoding ({hex_ratio:.1%}) — obfuscation")

    # F24: Multiple keyword density
    kw_density_hits = sum(
        1 for k in ["login", "verify", "secure", "account", "bank", "update", "signin"]
        if k in url_lower
    )
    features.append(kw_density_hits)
    if kw_density_hits > 1:
        reasons.append(f"Multiple phishing keywords ({kw_density_hits})")

    # F25: Homoglyph-normalized brand match
    norm_host = _normalize(hostname)
    homoglyph_hit = 0
    for brand in BRAND_KEYWORDS:
        if brand in norm_host and brand not in hostname and brand not in apex:
            homoglyph_hit = 1
            reasons.append(f"Homoglyph/lookalike for '{brand}' detected in hostname")
            break
    features.append(homoglyph_hit)

    # F26: Long subdomain string
    long_subdomain = 0
    if len(parts) > 2:
        subdomain_str = ".".join(parts[:-2])
        if len(subdomain_str) > 30:
            long_subdomain = 1
            reasons.append(f"Very long subdomain string ({len(subdomain_str)} chars)")
    features.append(long_subdomain)

    # F27: Slash count
    slash_count = url.count("/")
    features.append(slash_count)

    # F28: Is in DOMAIN_WHITELIST (now uses full merged set including CSVs)
    is_wl = int(_is_whitelisted(apex, full_hostname=hostname))
    features.append(is_wl)

    # F29: URL entropy (full URL)
    url_entropy = round(_shannon_entropy(url_lower), 4)
    features.append(url_entropy)

    assert len(features) == 30, f"Feature count {len(features)} != 30"
    return features, reasons


# =============================================================================
# Hard-rule overrides
# =============================================================================

def _hard_rules(url: str, features: list, reasons: list):
    """
    Return ('PHISHING', reason) if any hard indicator fires, else (None, None).
    Hard rules are NOT overridden by whitelist membership.
    """
    if features[4]:
        return "PHISHING", "HARD-RULE: IP address as hostname"
    if features[17]:
        return "HARD-RULE: Punycode IDN homograph", "PHISHING"  # swap fixed below
    if features[3]:
        return "PHISHING", "HARD-RULE: '@' symbol hides destination"
    if features[19] and not url.lower().startswith("https://www.google"):
        return "PHISHING", "HARD-RULE: Embedded redirect URL in path"
    return None, None


def _rule_boost(reasons: list) -> float:
    if not reasons: return 0.0
    return round(1.0 - math.exp(-len(reasons) * 0.18), 4)


_HIGH_CONF_RULES = [
    (
        re.compile(
            r"\.(tk|ml|ga|cf|gq|xyz|top|club|online|site|space|loan|win|"
            r"download|click|link|work|review|stream|bid|trade|fun)$",
            re.I,
        ),
        0.62,
        "Suspicious TLD frequently abused in phishing",
    ),
    (
        re.compile(
            r"(paypal|amazon|apple|microsoft|google|facebook|instagram|"
            r"netflix|linkedin|twitter|ebay|wellsfargo|chase|bankofamerica|"
            r"sbi|hdfc|icici|paytm)[^/]*"
            r"(secure|login|signin|update|verify|account|support|alert|bank|"
            r"kyc|refund|claim|reward)",
            re.I,
        ),
        0.58,
        "Brand + action word combo-squatting in domain",
    ),
    (
        re.compile(
            r"(account.{0,15}suspend|suspended.{0,15}account|"
            r"account.{0,15}blocked|blocked.{0,15}account)",
            re.I,
        ),
        0.60,
        "Account suspension keywords in URL",
    ),
]


def _direct_rule_score(url: str, features: list) -> tuple:
    """
    Apply high-confidence direct rules on the hostname.
    Whitelist-aware: combo-squat rule is suppressed when the brand IS the
    legitimate apex (e.g. paypal.com/signin should not fire combo-squat).
    Returns (bonus_score: float, extra_reasons: list[str]).
    """
    url_lower = url.lower()
    try:
        parsed   = urlparse(url_lower if url_lower.startswith("http") else "http://" + url_lower)
        hostname = (parsed.hostname or "").strip().lower().rstrip(".")
        if hostname.startswith("www."):
            hostname = hostname[4:]
    except Exception:
        hostname = ""

    apex = _get_apex(hostname)
    apex_whitelisted = _is_whitelisted(apex)

    bonus = 0.0
    extra: list = []
    for pattern, score, reason in _HIGH_CONF_RULES:
        m = pattern.search(hostname)
        if not m:
            continue
        # Combo-squatting: skip if the matched brand IS the whitelisted apex
        if reason.startswith("Brand") and m.lastindex and m.lastindex >= 1:
            brand_in_rule = m.group(1).lower()
            if apex_whitelisted and brand_in_rule and brand_in_rule in apex:
                continue
        bonus = max(bonus, score)
        extra.append(reason)
    return bonus, extra


# =============================================================================
# Whitelist override logic
# =============================================================================

# Direct-rule bonus threshold above which whitelist SAFE bypass is denied
_WHITELIST_SAFE_MAX_BONUS = 0.28

# Feature indices whose presence overrides the whitelist (subdomain abuse, etc.)
_WHITELIST_BYPASS_FEATURES = {
    4:  "IP as hostname",
    3:  "@ in URL",
    17: "Punycode IDN",
    19: "Embedded redirect",
    11: "Brand impersonation outside apex",
    21: "Typosquatting",
    22: "Combo-squatting",
    25: "Homoglyph attack",
}


def _whitelist_override(apex: str, features: list, direct_bonus: float) -> tuple:
    """
    Determine whether a whitelisted domain qualifies for a SAFE bypass.

    Returns:
        (should_bypass: bool, reduced_score: float, note: str)

    Logic:
        1. If ANY bypass feature fires -> deny SAFE, dampen score
        2. If direct_bonus >= threshold -> deny SAFE, dampen score to SUSPICIOUS max
        3. Otherwise -> grant SAFE bypass
    """
    for feat_idx, feat_desc in _WHITELIST_BYPASS_FEATURES.items():
        if features[feat_idx]:
            return (
                False,
                round(min(direct_bonus * 0.70, 0.55), 4),
                f"Whitelist overridden — {feat_desc} detected",
            )

    if direct_bonus >= _WHITELIST_SAFE_MAX_BONUS:
        reduced = round(min(direct_bonus * 0.65, 0.50), 4)
        return (
            False,
            reduced,
            f"Whitelist dampens phishing signals (bonus={direct_bonus:.2f} -> {reduced:.2f})",
        )

    return True, 0.0, "Verified legitimate domain (whitelist)"


# =============================================================================
# Main predict function
# =============================================================================

def predict(url: str, model=None) -> dict:
    """
    Predict phishing probability for a URL.

    Args:
        url:   URL string to analyze.
        model: Optional scikit-learn classifier. If None, uses rule-only mode.

    Returns dict:
        label           — "PHISHING" | "SUSPICIOUS" | "SAFE"
        confidence      — 0.0-1.0
        risk_tier       — "HIGH" | "MEDIUM" | "LOW"
        ml_probability  — raw ML output (0.0 if model=None)
        rule_score      — combined rule score 0.0-1.0
        reasons         — list[str] human-readable detection reasons
        detection_mode  — "hard-rule"|"whitelist"|"rule-based"|"hybrid"|"safe"
        whitelist_hit   — True if apex domain is in DOMAIN_WHITELIST
    """
    # ── Debug entry log ───────────────────────────────────────────────────────
    # This log line confirms the detector is actually being called in production.
    # If you see "SAFE" results without this line appearing, the call is being
    # short-circuited upstream (e.g. initialize() failure returning early).
    logger.debug("predict() called | url=%s | model=%s | whitelist_size=%d",
                 url[:120], "loaded" if model else "None", len(DOMAIN_WHITELIST))

    features, reasons = extract_features(url)

    # Resolve apex (re-used from feature extraction)
    try:
        hostname = (urlparse(url.lower()).hostname or "").strip().lower().rstrip(".")
        if hostname.startswith("www."):
            hostname = hostname[4:]
    except Exception:
        hostname = ""
    apex = _get_apex(hostname)
    is_whitelisted = bool(features[28])

    # ── Step 1: Hard-rule override ─────────────────────────────────────────
    hard_result, hard_reason = _hard_rules(url, features, reasons)
    # Fix the accidental swap in punycode case
    if hard_result and hard_result.startswith("HARD-RULE"):
        hard_result, hard_reason = hard_reason, hard_result
    if hard_result == "PHISHING":
        if hard_reason not in reasons:
            reasons.insert(0, hard_reason)
        logger.debug("predict() hard-rule PHISHING | url=%s | reason=%s", url[:80], hard_reason)
        return {
            "label":          "PHISHING",
            "confidence":     0.97,
            "risk_tier":      "HIGH",
            "ml_probability": 0.97,
            "rule_score":     1.0,
            "reasons":        reasons,
            "detection_mode": "hard-rule",
            "whitelist_hit":  is_whitelisted,
        }

    # ── Step 2: Direct rule bonus ──────────────────────────────────────────
    direct_bonus, direct_extra = _direct_rule_score(url, features)

    # ── Step 3: Whitelist check with safe-override logic ───────────────────
    # FIX: Whitelist grants SAFE only when no strong signals are present.
    # Previously, ANY whitelisted apex would short-circuit to SAFE, silently
    # bypassing detection for combo-squatted subdomains of known brands.
    # The _whitelist_override() function enforces this correctly — this comment
    # clarifies the intended contract so future maintainers don't "simplify" it.
    if is_whitelisted:
        should_bypass, reduced_score, wl_note = _whitelist_override(
            apex, features, direct_bonus
        )
        if should_bypass:
            logger.debug("predict() whitelist SAFE | apex=%s", apex)
            return {
                "label":          "SAFE",
                "confidence":     0.95,
                "risk_tier":      "LOW",
                "ml_probability": 0.0,
                "rule_score":     0.0,
                "reasons":        [wl_note],
                "detection_mode": "whitelist",
                "whitelist_hit":  True,
            }
        # Whitelist present but phishing signals detected — dampen but do not ignore
        if wl_note not in reasons:
            reasons.append(wl_note)
        direct_bonus = reduced_score

    # ── Step 4: Normal scoring ─────────────────────────────────────────────
    for r in direct_extra:
        if r not in reasons:
            reasons.insert(0, r)

    rule_score = _rule_boost(reasons)
    rule_score = round(max(rule_score, direct_bonus), 4)

    if model is not None:
        proba   = model.predict_proba([features])[0]
        ml_prob = float(proba[1])
        if is_whitelisted:
            ml_prob = min(ml_prob, 0.25)
        final_prob = (ml_prob * 0.60) + (rule_score * 0.40)
        if ml_prob < 0.40 and final_prob >= 0.65:
            final_prob = 0.64
    else:
        ml_prob    = rule_score
        final_prob = rule_score

    final_prob = round(min(final_prob, 1.0), 4)

    # ── Step 5: Label ──────────────────────────────────────────────────────
    if final_prob >= 0.55:
        label, risk_tier = "PHISHING", "HIGH"
    elif final_prob >= 0.30:
        label, risk_tier = "SUSPICIOUS", "MEDIUM"
    else:
        label, risk_tier = "SAFE", "LOW"

    mode = "hybrid" if (model and label != "SAFE") else ("rule-based" if label != "SAFE" else "safe")

    logger.debug(
        "predict() result | label=%s | final_prob=%.4f | rule_score=%.4f | "
        "reasons=%d | whitelist=%s | url=%s",
        label, final_prob, rule_score, len(reasons), is_whitelisted, url[:80],
    )

    return {
        "label":          label,
        "confidence":     final_prob if label != "SAFE" else round(1.0 - final_prob, 4),
        "risk_tier":      risk_tier,
        "ml_probability": round(ml_prob, 4),
        "rule_score":     rule_score,
        "reasons":        reasons,
        "detection_mode": mode,
        "whitelist_hit":  is_whitelisted,
    }


# =============================================================================
# Diagnostic helper
# =============================================================================

def whitelist_stats() -> dict:
    """
    Return statistics about the loaded whitelist (for health checks / logging).

    FIX: Added csv_load_succeeded flag so url_service.initialize() can detect
    the silent-failure case where CSV files were not found in production.
    """
    return {
        "total_entries":       len(DOMAIN_WHITELIST),
        "csv_entries":         len(_CSV_WHITELIST),
        "builtin_entries":     len(_BUILTIN_WHITELIST),
        "csv_load_succeeded":  _CSV_FILES_FOUND,         # NEW — health check flag
        "search_paths":        [str(p) for p in _WHITELIST_CSV_PATHS],  # NEW — aids debugging
    }
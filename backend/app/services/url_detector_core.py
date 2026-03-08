"""
URL Phishing Detector — v3.0 (Improved)
=========================================
Improvements over v2.x:
  1. Extended feature set (23 features vs 9):
     - Domain entropy calculation
     - Suspicious TLD detection
     - Subdomain count
     - URL shortener detection
     - Suspicious query param detection
     - Special char ratios
     - Brand impersonation keywords
     - Path depth
     - Digit ratio in domain
     - Double slash in path
  2. RandomForest with tuned hyperparameters (n_estimators=200, max_depth=20)
  3. Improved hybrid scoring: ML probability + rule trigger count combined
  4. More granular risk tiers: SAFE / SUSPICIOUS / PHISHING
  5. Deletion of stale model.pkl forced when feature count changes
"""

import math
import pandas as pd
import re
import os
import pickle
import logging
import hashlib

from urllib.parse import urlparse, parse_qs
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import accuracy_score, classification_report

logger = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(BASE_DIR, "data")
MODEL_PATH = os.path.join(BASE_DIR, "model.pkl")

# ── Constants ──────────────────────────────────────────────────────────────────
FEATURE_COUNT = 23   # bump this when adding features to force retraining

# Known URL shorteners
URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd",
    "buff.ly", "adf.ly", "short.link", "cutt.ly", "rb.gy", "shorturl.at",
    "tiny.cc", "shorte.st", "bc.vc", "clk.sh", "0rz.tw",
}

# Suspicious TLDs commonly abused in phishing
SUSPICIOUS_TLDS = {
    ".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".club", ".work",
    ".click", ".link", ".online", ".site", ".website", ".space", ".fun",
    ".loan", ".win", ".download", ".accountant", ".review", ".country",
    ".stream", ".gdn", ".bid", ".trade", ".cricket", ".science",
}

# Brand impersonation keywords
BRAND_KEYWORDS = [
    "paypal", "amazon", "apple", "microsoft", "google", "facebook",
    "instagram", "netflix", "dropbox", "linkedin", "twitter", "ebay",
    "wellsfargo", "chase", "bankofamerica", "citibank", "barclays",
    "sbi", "hdfc", "icici", "kotak", "paytm", "phonepe", "gpay",
    "whatsapp", "telegram", "yahoo", "outlook", "office365",
]

# Suspicious query parameter names
SUSPICIOUS_PARAMS = {
    "redirect", "redir", "url", "next", "goto", "dest", "destination",
    "return", "returnurl", "returnto", "target", "forward", "link",
    "ref", "referer", "checkout", "payment",
}

# Sensitive path keywords
SENSITIVE_PATH_WORDS = [
    "login", "signin", "sign-in", "logon", "log-in",
    "verify", "verification", "validate", "validation",
    "account", "update", "confirm", "secure", "security",
    "bank", "password", "passwd", "credential", "auth",
    "wallet", "payment", "checkout", "billing",
]


# ── Feature Extraction ─────────────────────────────────────────────────────────
def _shannon_entropy(s: str) -> float:
    """Shannon entropy of a string — high entropy = random-looking domain."""
    if not s:
        return 0.0
    freq = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    length = len(s)
    return -sum((v / length) * math.log2(v / length) for v in freq.values())


def extract_features_with_reasons(url: str):
    """
    Extract 23 numerical features + human-readable rule reasons from a URL.
    Returns: (features: list[float], reasons: list[str])
    """
    features = []
    reasons  = []
    url_lower = url.lower().strip()

    try:
        parsed = urlparse(url_lower if url_lower.startswith("http") else "http://" + url_lower)
        domain   = parsed.netloc or ""
        path     = parsed.path or ""
        query    = parsed.query or ""
        hostname = domain.split(":")[0]   # strip port
    except Exception:
        parsed = None
        domain = hostname = path = query = ""

    # ── 1. URL total length ────────────────────────────────────────────────────
    url_len = len(url)
    features.append(url_len)
    if url_len > 75:
        reasons.append(f"URL is unusually long ({url_len} chars)")

    # ── 2. Dot count ──────────────────────────────────────────────────────────
    dot_count = url.count(".")
    features.append(dot_count)
    if dot_count > 4:
        reasons.append(f"Excessive dot count ({dot_count}) — subdomain abuse pattern")

    # ── 3. Hyphen count ───────────────────────────────────────────────────────
    hyphen_count = hostname.count("-")
    features.append(hyphen_count)
    if hyphen_count > 2:
        reasons.append(f"Many hyphens ({hyphen_count}) in domain — brand-spoofing indicator")

    # ── 4. Slash count ────────────────────────────────────────────────────────
    slash_count = url.count("/")
    features.append(slash_count)

    # ── 5. @ symbol ───────────────────────────────────────────────────────────
    has_at = "@" in url
    features.append(1 if has_at else 0)
    if has_at:
        reasons.append("Contains '@' — hides real destination after @")

    # ── 6. IP address as hostname ─────────────────────────────────────────────
    has_ip = bool(re.search(r"(?<!\d)(\d{1,3}\.){3}\d{1,3}(?!\d)", hostname))
    features.append(1 if has_ip else 0)
    if has_ip:
        reasons.append("Uses raw IP address instead of a domain name")

    # ── 7. HTTPS ──────────────────────────────────────────────────────────────
    is_https = url_lower.startswith("https")
    features.append(1 if is_https else 0)
    if not is_https:
        reasons.append("Not using HTTPS — unencrypted connection")

    # ── 8. Suspicious words in URL ────────────────────────────────────────────
    found_sensitive = [w for w in SENSITIVE_PATH_WORDS if w in url_lower]
    features.append(len(found_sensitive))
    if found_sensitive:
        reasons.append(f"Sensitive keywords in URL: {', '.join(found_sensitive[:4])}")

    # ── 9. Long URL flag (binary) ─────────────────────────────────────────────
    features.append(1 if url_len > 75 else 0)

    # ── 10. Subdomain count ───────────────────────────────────────────────────
    parts = hostname.split(".")
    subdomain_count = max(0, len(parts) - 2)
    features.append(subdomain_count)
    if subdomain_count > 2:
        reasons.append(f"Excessive subdomains ({subdomain_count}) — common in phishing URLs")

    # ── 11. Domain entropy ────────────────────────────────────────────────────
    apex = ".".join(parts[-2:]) if len(parts) >= 2 else hostname
    apex_name = apex.split(".")[0]
    entropy = round(_shannon_entropy(apex_name), 4)
    features.append(entropy)
    if entropy > 3.8:
        reasons.append(f"High domain entropy ({entropy:.2f}) — likely randomly generated domain")

    # ── 12. Suspicious TLD ────────────────────────────────────────────────────
    tld = "." + parts[-1] if parts else ""
    is_suspicious_tld = tld in SUSPICIOUS_TLDS
    features.append(1 if is_suspicious_tld else 0)
    if is_suspicious_tld:
        reasons.append(f"Suspicious TLD '{tld}' — frequently abused in phishing campaigns")

    # ── 13. URL shortener ─────────────────────────────────────────────────────
    is_shortener = any(s in hostname for s in URL_SHORTENERS)
    features.append(1 if is_shortener else 0)
    if is_shortener:
        reasons.append("URL shortener detected — masks true destination")

    # ── 14. Brand keyword impersonation ───────────────────────────────────────
    found_brands = [b for b in BRAND_KEYWORDS if b in url_lower]
    brand_not_in_apex = found_brands and not any(b in apex for b in found_brands)
    features.append(1 if brand_not_in_apex else 0)
    if brand_not_in_apex:
        reasons.append(f"Brand keyword(s) '{', '.join(found_brands[:2])}' in path/subdomain — impersonation attempt")

    # ── 15. Digit ratio in domain ─────────────────────────────────────────────
    digit_ratio = sum(c.isdigit() for c in hostname) / max(len(hostname), 1)
    features.append(round(digit_ratio, 4))
    if digit_ratio > 0.3:
        reasons.append(f"High digit ratio ({digit_ratio:.0%}) in domain — auto-generated domain pattern")

    # ── 16. Special char ratio in URL ─────────────────────────────────────────
    special_chars = sum(1 for c in url if c in "%=&?#~_;,")
    special_ratio = special_chars / max(len(url), 1)
    features.append(round(special_ratio, 4))
    if special_ratio > 0.15:
        reasons.append(f"High special-character ratio ({special_ratio:.0%}) — encoded/obfuscated URL")

    # ── 17. Suspicious query parameters ──────────────────────────────────────
    try:
        qparams = set(parse_qs(query).keys())
        has_suspicious_params = bool(qparams & SUSPICIOUS_PARAMS)
    except Exception:
        has_suspicious_params = False
    features.append(1 if has_suspicious_params else 0)
    if has_suspicious_params:
        reasons.append("Suspicious redirect/forwarding query parameters detected")

    # ── 18. Path depth ────────────────────────────────────────────────────────
    path_depth = len([p for p in path.split("/") if p])
    features.append(path_depth)

    # ── 19. Double slash in path (//url= tricks) ─────────────────────────────
    has_double_slash = "//" in path
    features.append(1 if has_double_slash else 0)
    if has_double_slash:
        reasons.append("Double slash in path — open redirect indicator")

    # ── 20. Punycode / IDN homograph ─────────────────────────────────────────
    has_punycode = "xn--" in hostname
    features.append(1 if has_punycode else 0)
    if has_punycode:
        reasons.append("Punycode (IDN homograph) detected — visually spoofs trusted domain")

    # ── 21. Port in URL ───────────────────────────────────────────────────────
    has_non_std_port = bool(re.search(r":\d{2,5}", domain)) and not domain.endswith(":80") and not domain.endswith(":443")
    features.append(1 if has_non_std_port else 0)
    if has_non_std_port:
        reasons.append("Non-standard port in URL — atypical for legitimate sites")

    # ── 22. Repeated URL keyword (url= in path) ───────────────────────────────
    has_url_in_path = "url=" in url_lower or "http" in path
    features.append(1 if has_url_in_path else 0)
    if has_url_in_path:
        reasons.append("Embedded URL/redirect in path — redirect-chain phishing pattern")

    # ── 23. TLD in path (e.g. .com appearing mid-path) ───────────────────────
    tld_in_path = bool(re.search(r"\.(com|net|org|info|co|io)/", path))
    features.append(1 if tld_in_path else 0)
    if tld_in_path:
        reasons.append("TLD token appearing mid-path — domain-confusion technique")

    assert len(features) == FEATURE_COUNT, f"Feature count mismatch: got {len(features)}, expected {FEATURE_COUNT}"
    return features, reasons


# ── Dataset Loading & Training ─────────────────────────────────────────────────
def _load_and_train() -> RandomForestClassifier:
    """Load CSVs, balance dataset, train improved RandomForest, return model."""
    logger.info("🔧 Training improved URL detection model (v3.0) from datasets…")

    df1_path = os.path.join(DATA_DIR, "dataset_link_phishing.csv")
    df3_path = os.path.join(DATA_DIR, "phishing_url_dataset_unique.csv")

    dfs = []

    if os.path.exists(df1_path):
        df1 = pd.read_csv(df1_path, low_memory=False)[["url", "status"]]
        df1["label"] = df1["status"].apply(lambda x: 1 if str(x).strip().lower() == "phishing" else 0)
        dfs.append(df1[["url", "label"]])
        logger.info(f"   Loaded df1: {len(df1)} rows")
    else:
        logger.warning(f"   ⚠ Dataset not found: {df1_path}")

    if os.path.exists(df3_path):
        df3 = pd.read_csv(df3_path)[["url", "label"]]
        dfs.append(df3)
        logger.info(f"   Loaded df3: {len(df3)} rows")
    else:
        logger.warning(f"   ⚠ Dataset not found: {df3_path}")

    if not dfs:
        raise FileNotFoundError("No training datasets found. Place CSVs in backend/data/.")

    df = pd.concat(dfs).drop_duplicates(subset=["url"]).dropna()
    df["url"] = df["url"].str.strip().str.lower()
    logger.info(f"   Combined dataset: {df.shape[0]} rows")

    # Balance classes
    phish = df[df.label == 1]
    safe  = df[df.label == 0].sample(len(phish), random_state=42)
    df    = pd.concat([phish, safe]).sample(frac=1, random_state=42).reset_index(drop=True)
    logger.info(f"   Balanced dataset: {df.shape[0]} rows ({len(phish)} each class)")

    logger.info("   Extracting features (this may take a moment)…")
    X = df["url"].apply(lambda u: extract_features_with_reasons(u)[0]).tolist()
    y = df["label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    # Tuned RandomForest: more trees, depth-limited to reduce overfitting
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=20,
        min_samples_leaf=3,
        max_features="sqrt",
        random_state=42,
        n_jobs=-1,
        class_weight="balanced",
    )
    model.fit(X_train, y_train)

    pred  = model.predict(X_test)
    acc   = accuracy_score(y_test, pred)
    logger.info(f"   ✅ Model trained — accuracy: {acc:.4f}")
    logger.info("\n" + classification_report(y_test, pred))

    # Attach metadata so stale model detection works
    model._phishguard_feature_count = FEATURE_COUNT

    return model


def load_or_train_model() -> RandomForestClassifier:
    """
    Load model.pkl if it exists AND was built with the current feature count.
    Otherwise retrain and save.
    """
    if os.path.exists(MODEL_PATH):
        try:
            with open(MODEL_PATH, "rb") as f:
                model = pickle.load(f)
            # Validate feature count compatibility
            if getattr(model, "_phishguard_feature_count", None) == FEATURE_COUNT:
                logger.info(f"📦 Loaded pre-trained model from {MODEL_PATH}")
                return model
            else:
                logger.warning("⚠ Stale model (feature count mismatch) — retraining…")
                os.remove(MODEL_PATH)
        except Exception as e:
            logger.warning(f"⚠ Could not load model ({e}) — retraining…")
            if os.path.exists(MODEL_PATH):
                os.remove(MODEL_PATH)

    model = _load_and_train()
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)
    logger.info(f"💾 Model saved to {MODEL_PATH}")
    return model


# ── Module-level model reference ──────────────────────────────────────────────
_model: RandomForestClassifier | None = None


def set_model(model: RandomForestClassifier) -> None:
    global _model
    _model = model


# ── Feature metadata for human-readable ML explanations ─────────────────────
_FEATURE_META = [
    (0,  lambda url, f: f"URL length ({int(f[0])} chars) is in the range associated with phishing"),
    (1,  lambda url, f: f"Dot count ({int(f[1])}) matches subdomain-abuse phishing patterns"),
    (2,  lambda url, f: f"Hyphen density ({int(f[2])}) is characteristic of domain-spoofing attacks"),
    (3,  lambda url, f: f"Deep path structure ({int(f[3])} slashes) typical of redirect-chain phishing"),
    (5,  lambda url, f: "Raw IP address used as hostname — strong phishing indicator"),
    (6,  lambda url, f: "Plain HTTP — phishing pages frequently skip HTTPS"),
    (7,  lambda url, f: "Credential-harvesting vocabulary detected in URL tokens"),
    (10, lambda url, f: f"Excessive subdomain nesting ({int(f[10])}) — free-subdomain phishing technique"),
    (11, lambda url, f: f"High domain entropy ({f[11]:.2f}) — randomly generated domain"),
    (12, lambda url, f: "Suspicious TLD associated with high phishing prevalence"),
    (13, lambda url, f: "URL shortener — destination obfuscated"),
    (14, lambda url, f: "Brand name found in subdomain/path rather than apex domain — impersonation"),
    (15, lambda url, f: f"Digit-heavy domain ({f[15]:.0%} digits) — auto-generated hostname pattern"),
]


def _ml_fallback_reasons(url: str, features: list, phishing_prob: float) -> list:
    reasons = []
    importances = getattr(_model, "feature_importances_", None)

    if importances is not None and len(importances) == len(features):
        weighted = [(imp * (abs(fv) + 0.01), idx)
                    for idx, (imp, fv) in enumerate(zip(importances, features))]
        weighted.sort(reverse=True)
        top_indices = {idx for _, idx in weighted[:5]}
    else:
        top_indices = set(range(len(features)))

    for feat_idx, desc_fn in _FEATURE_META:
        if feat_idx in top_indices and features[feat_idx] > 0:
            try:
                reasons.append(desc_fn(url, features))
            except Exception:
                pass

    confidence_pct = round(phishing_prob * 100, 1)
    reasons.append(
        f"ML model flagged this URL with {confidence_pct}% phishing probability "
        f"based on statistical patterns across ~68,000 known URLs"
    )

    # Deduplicate
    seen, unique = set(), []
    for r in reasons:
        if r not in seen:
            seen.add(r)
            unique.append(r)
    return unique


# ── Rule-based scoring overlay ────────────────────────────────────────────────
def _rule_score(reasons: list) -> float:
    """
    Convert reason count to a 0-1 additive score that boosts ML probability.
    Each triggered reason adds weight; soft-capped via exponential.
    """
    if not reasons:
        return 0.0
    raw = len(reasons) * 0.12
    return round(1.0 - math.exp(-raw), 4)


# ── Prediction ────────────────────────────────────────────────────────────────
def predict_url(url: str) -> dict:
    """
    Predict whether a URL is phishing.

    Hybrid scoring:
        final_prob = (ml_prob * 0.65) + (rule_score * 0.35)

    Classification thresholds:
        >= 0.65 → PHISHING
        0.35–0.65 → SUSPICIOUS
        < 0.35 → SAFE

    Returns:
        label, confidence, risk_tier, reasons, detection_mode
    """
    if _model is None:
        raise RuntimeError("Model not initialised. Call set_model() first.")

    features, reasons = extract_features_with_reasons(url)
    proba = _model.predict_proba([features])[0]

    ml_phishing_prob = float(proba[1])
    ml_safe_prob     = float(proba[0])

    # Rule-based overlay
    rule_boost = _rule_score(reasons)

    # Hybrid score: weighted combination
    final_prob = (ml_phishing_prob * 0.65) + (rule_boost * 0.35)
    final_prob = round(min(final_prob, 1.0), 4)

    # Classification
    if final_prob >= 0.65:
        label = "PHISHING"
        risk_tier = "HIGH"
        confidence = final_prob
    elif final_prob >= 0.35:
        label = "SUSPICIOUS"
        risk_tier = "MEDIUM"
        confidence = final_prob
    else:
        label = "SAFE"
        risk_tier = "LOW"
        confidence = round(ml_safe_prob, 4)

    # Ensure PHISHING never has empty reasons
    if label in ("PHISHING", "SUSPICIOUS") and not reasons:
        reasons = _ml_fallback_reasons(url, features, ml_phishing_prob)
        detection_mode = "ml-pattern"
    elif reasons:
        detection_mode = "rule-based"
    else:
        detection_mode = "safe"

    return {
        "label":          label,
        "confidence":     confidence,
        "risk_tier":      risk_tier,
        "ml_probability": round(ml_phishing_prob, 4),
        "rule_score":     rule_boost,
        "reasons":        reasons,
        "detection_mode": detection_mode,
    }


# ── CLI entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    mdl = load_or_train_model()
    set_model(mdl)

    user_url = input("\nEnter URL to check: ").strip()
    result   = predict_url(user_url)
    label    = result["label"]
    conf     = result["confidence"] * 100
    icon     = "🚨" if label == "PHISHING" else ("⚠️" if label == "SUSPICIOUS" else "✅")
    print(f"\n{icon}  {label}  ({conf:.1f}% confidence)  [{result['risk_tier']} RISK]")
    if result["reasons"]:
        print("Reasons:")
        for r in result["reasons"]:
            print(f"  • {r}")
    else:
        print("No risk patterns detected.")

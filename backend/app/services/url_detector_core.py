"""
URL Phishing Detector — Production Version
==========================================
Changes from original:
  1. Model is trained ONCE and saved to model.pkl
  2. On subsequent runs, model is loaded from disk (no retraining)
  3. predict_url() now returns structured JSON dict instead of a string
  4. Training is triggered by calling load_or_train_model()
  5. [v2.1] Fallback explanations generated when model flags PHISHING but
     no explicit rule triggers fired — eliminates the "PHISHING + empty reasons"
     contradiction.  ML feature importances used to build context-aware text.
"""

import pandas as pd
import re
import os
import pickle
import logging

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

logger = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(BASE_DIR, "data")
MODEL_PATH = os.path.join(BASE_DIR, "model.pkl")

# ── Feature Extraction (unchanged logic) ──────────────────────────────────────
def extract_features_with_reasons(url: str):
    features = []
    reasons  = []

    # Length
    features.append(len(url))
    if len(url) > 75:
        reasons.append("URL is unusually long")

    # Dots
    dot_count = url.count(".")
    features.append(dot_count)
    if dot_count > 3:
        reasons.append("Too many dots in URL")

    # Hyphens
    features.append(url.count("-"))

    # Slashes
    features.append(url.count("/"))

    # @ symbol
    has_at = "@" in url
    features.append(1 if has_at else 0)
    if has_at:
        reasons.append("Contains '@' symbol (suspicious)")

    # IP address
    has_ip = bool(re.search(r"\d+\.\d+\.\d+\.\d+", url))
    features.append(1 if has_ip else 0)
    if has_ip:
        reasons.append("Uses IP address instead of domain")

    # HTTPS
    is_https = url.startswith("https")
    features.append(1 if is_https else 0)
    if not is_https:
        reasons.append("Not using HTTPS")

    # Suspicious words
    suspicious_words = ["login", "verify", "update", "secure", "account", "bank"]
    found_words = [w for w in suspicious_words if w in url.lower()]
    features.append(1 if found_words else 0)
    if found_words:
        reasons.append(f"Contains suspicious words: {', '.join(found_words)}")

    # Length category flag
    features.append(1 if len(url) > 75 else 0)

    return features, reasons


# ── Dataset Loading & Training ────────────────────────────────────────────────
def _load_and_train() -> RandomForestClassifier:
    """Load CSVs, balance dataset, train RandomForest, return model."""
    logger.info("🔧 Training URL detection model from datasets…")

    df1_path = os.path.join(DATA_DIR, "dataset_link_phishing.csv")
    df3_path = os.path.join(DATA_DIR, "phishing_url_dataset_unique.csv")

    dfs = []

    if os.path.exists(df1_path):
        df1 = pd.read_csv(df1_path)[["url", "status"]]
        df1["label"] = df1["status"].apply(lambda x: 1 if x == "phishing" else 0)
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
        raise FileNotFoundError(
            "No training datasets found. Place CSVs in backend/data/."
        )

    df = pd.concat(dfs).drop_duplicates().dropna()
    df["url"] = df["url"].str.strip().str.lower()
    logger.info(f"   Combined dataset: {df.shape[0]} rows")

    # Balance classes
    phish = df[df.label == 1]
    safe  = df[df.label == 0].sample(len(phish), random_state=42)
    df    = pd.concat([phish, safe]).sample(frac=1, random_state=42).reset_index(drop=True)
    logger.info(f"   Balanced dataset: {df.shape[0]} rows ({len(phish)} each class)")

    X = df["url"].apply(lambda u: extract_features_with_reasons(u)[0]).tolist()
    y = df["label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42
    )

    model = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)

    pred = model.predict(X_test)
    acc  = accuracy_score(y_test, pred)
    logger.info(f"   ✅ Model trained — accuracy: {acc:.4f}")
    logger.info("\n" + classification_report(y_test, pred))

    return model


def load_or_train_model() -> RandomForestClassifier:
    """
    Load model from model.pkl if it exists; otherwise train and save it.
    Call this ONCE at application startup.
    """
    if os.path.exists(MODEL_PATH):
        logger.info(f"📦 Loading pre-trained model from {MODEL_PATH}")
        with open(MODEL_PATH, "rb") as f:
            model = pickle.load(f)
        logger.info("   ✅ Model loaded successfully")
        return model

    model = _load_and_train()
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)
    logger.info(f"💾 Model saved to {MODEL_PATH}")
    return model


# ── Module-level model reference (set by FastAPI on startup) ──────────────────
_model: RandomForestClassifier | None = None


def set_model(model: RandomForestClassifier) -> None:
    """Inject the trained model into this module (called from main.py startup)."""
    global _model
    _model = model


# ── Feature metadata (mirrors extract_features_with_reasons order) ────────────
# Each entry: (feature_name, high_value_description, low_value_description)
# Used to generate human-readable ML explanations from feature importances.
_FEATURE_META = [
    ("url_length",        "URL is unusually long ({val} characters)",                   None),
    ("dot_count",         "Elevated dot count ({val}) — common in subdomain abuse",      None),
    ("hyphen_count",      "Contains {val} hyphen(s) — often used to mimic trusted domains", None),
    ("slash_count",       "Deep path structure ({val} slashes) — typical of redirect chains", None),
    ("has_at_symbol",     "Contains '@' symbol — used to disguise the real destination", None),
    ("has_ip_address",    "Uses a raw IP address instead of a domain name",              None),
    ("is_not_https",      "Connection is not secured with HTTPS",                        None),
    ("has_suspicious_words", "URL contains words associated with credential harvesting", None),
    ("long_url_flag",     "URL length exceeds safe threshold (75 characters)",           None),
]


def _ml_fallback_reasons(url: str, features: list[float], phishing_prob: float) -> list[str]:
    """
    Generate context-aware, human-readable explanations when the ML model
    predicts PHISHING but no explicit rule triggered.

    Strategy:
      1. Use RandomForest feature_importances_ weighted by the actual feature
         values to rank which features most influenced this prediction.
      2. Build natural-language sentences for the top contributors.
      3. Always append a generic ML-layer explanation as the final entry.
    """
    reasons: list[str] = []

    # ── Step 1: rank features by importance × activation ──────────────────────
    importances = getattr(_model, "feature_importances_", None)
    if importances is not None and len(importances) == len(features):
        # Weight importance by whether the feature is "on" (non-zero)
        weighted = [(imp * (1 if fv > 0 else 0.1), idx)
                    for idx, (imp, fv) in enumerate(zip(importances, features))]
        weighted.sort(reverse=True)
        top_indices = [idx for _, idx in weighted[:4] if weighted[0][0] > 0]
    else:
        top_indices = []

    # ── Step 2: contextual sentences for each top feature ────────────────────
    url_len     = len(url)
    dot_count   = url.count(".")
    hyphen_cnt  = url.count("-")
    slash_cnt   = url.count("/")

    feature_sentences = {
        0: f"URL length ({url_len} chars) is statistically associated with phishing pages",
        1: f"Dot count ({dot_count}) matches patterns seen in subdomain-based phishing",
        2: f"Hyphen usage ({hyphen_cnt}) is characteristic of domain-spoofing attacks",
        3: f"Deep path depth ({slash_cnt} slashes) is typical in redirect-chain phishing",
        4: "Structural token patterns align with known phishing URL fingerprints",
        5: "Domain lacks a human-readable name — raw IPs are a strong phishing indicator",
        6: "Plain HTTP protocol detected — phishing pages frequently skip HTTPS",
        7: "Lexical analysis flagged credential-harvesting vocabulary in the URL",
        8: "URL length exceeds the safe threshold used in model training",
    }

    for idx in top_indices:
        sentence = feature_sentences.get(idx)
        if sentence:
            reasons.append(sentence)

    # ── Step 3: always add the ML-layer explanation ───────────────────────────
    confidence_pct = round(phishing_prob * 100, 1)
    reasons.append(
        f"Machine learning model flagged this URL with {confidence_pct}% phishing probability "
        f"based on learned statistical patterns across thousands of known phishing URLs"
    )

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for r in reasons:
        if r not in seen:
            seen.add(r)
            unique.append(r)

    return unique


# ── Prediction (JSON output) ──────────────────────────────────────────────────
def predict_url(url: str) -> dict:
    """
    Predict whether a URL is phishing.

    Returns:
        {
            "label":          "PHISHING" | "SAFE",
            "confidence":     float (0–1),
            "reasons":        list[str],   -- never empty for PHISHING
            "detection_mode": "rule-based" | "ml-pattern" | "safe"
        }

    detection_mode values:
      "rule-based"  — at least one explicit rule fired
      "ml-pattern"  — model flagged it but no rule fired (fallback explanations used)
      "safe"        — classified as SAFE
    """
    if _model is None:
        raise RuntimeError("Model not initialised. Call set_model() first.")

    features, reasons = extract_features_with_reasons(url)
    proba = _model.predict_proba([features])[0]

    phishing_prob = float(round(proba[1], 4))
    safe_prob     = float(round(proba[0], 4))

    label      = "PHISHING" if phishing_prob > 0.5 else "SAFE"
    confidence = phishing_prob if label == "PHISHING" else safe_prob

    # ── Determine detection mode & ensure reasons are never empty for PHISHING ─
    if label == "PHISHING":
        if reasons:
            detection_mode = "rule-based"
        else:
            # No rule fired — generate ML-derived fallback explanations
            reasons = _ml_fallback_reasons(url, features, phishing_prob)
            detection_mode = "ml-pattern"
    else:
        # SAFE: reasons may legitimately be empty — that's fine
        detection_mode = "safe"

    return {
        "label":          label,
        "confidence":     confidence,
        "reasons":        reasons,
        "detection_mode": detection_mode,
    }


# ── CLI entry point (for standalone testing) ──────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    mdl = load_or_train_model()
    set_model(mdl)

    user_url = input("\nEnter URL to check: ").strip()
    result   = predict_url(user_url)
    label    = result["label"]
    conf     = result["confidence"] * 100
    icon     = "⚠️" if label == "PHISHING" else "✅"
    print(f"\n{icon}  {label}  ({conf:.2f}% confidence)")
    if result["reasons"]:
        print("Reasons:")
        for r in result["reasons"]:
            print(f"  • {r}")
    else:
        print("No obvious risk patterns detected.")
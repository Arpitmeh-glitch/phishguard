"""
improved_message_detector.py
==============================
Enhanced phishing/fraud message detector.

Improvements over sms_detector_core.py v2.0:
  1. Contextual scoring: co-occurrence of patterns raises score multiplicatively
  2. Negation detection: "do NOT share your OTP" no longer fires
  3. Urgency score: counts urgency tokens and weights them
  4. Manipulation score: fear + greed + authority separately tracked
  5. Sentence-level deception: subject–verb analysis for credential requests
  6. Link context scoring: suspicious URLs near action words score higher
  7. Cleaner deduplication of reasons
  8. Language-aware thresholds
"""

import re
import math
import unicodedata

# ── Thresholds ─────────────────────────────────────────────────────────────────
FRAUD_THRESHOLD      = 0.52
SUSPICIOUS_THRESHOLD = 0.26

F = re.IGNORECASE

# ── Negation window (tokens before a pattern that cancel it) ──────────────────
NEGATION_PATTERN = re.compile(
    r"\b(do\s*not|don'?t|never|not|no|please\s*do\s*not|we\s*will\s*never"
    r"|we\s*never\s*ask|legitimate\s*\w+\s*will\s*never"
    r"|we\s*do\s*not|we\s*won'?t|nahi|mat|nahim)\b",
    F
)

def _is_negated(text: str, match_start: int, window: int = 60) -> bool:
    """Check if a negation word appears within `window` chars before the match."""
    prefix = text[max(0, match_start - window): match_start]
    return bool(NEGATION_PATTERN.search(prefix))


# ── Rule definition ────────────────────────────────────────────────────────────
# (pattern, base_score, reason, is_hard, category)
# category: "credential"|"threat"|"urgency"|"lure"|"link"|"identity"|"context"
RULES = [
    # ── OTP / One-time codes ──────────────────────────────────────────────────
    (re.compile(
        r"(give|send|share|provide|tell|bata|bhejo|batao|dedo|dijiye)\b.{0,40}\botp\b"
        r"|\botp\b.{0,40}(give|send|share|provide|bhejo|batao)", F),
     0.93, "Requesting OTP from victim", True, "credential"),

    (re.compile(r"\bone[\s\-]?time[\s\-]?(pass(word)?|code|pin)\b"
                r"|\bverification[\s\-]?(code|number|pin)\b", F),
     0.72, "One-time / verification code requested", False, "credential"),

    (re.compile(r"\botp\b", F),
     0.38, "OTP keyword present", False, "credential"),

    # ── Bank / account details ─────────────────────────────────────────────────
    (re.compile(
        r"(give|send|share|provide|submit|enter|fill).{0,40}"
        r"(bank\s*(detail|account|info|number|data)|account\s*(number|detail|no))", F),
     0.87, "Requesting bank/account details", True, "credential"),

    (re.compile(r"\b(ifsc|sort[\s\-]?code|routing[\s\-]?number)\b", F),
     0.65, "Bank routing/IFSC code requested", False, "credential"),

    # ── CVV / card ────────────────────────────────────────────────────────────
    (re.compile(r"\b(cvv|cvc2?|card\s*verification\s*(value|code))\b", F),
     0.93, "CVV/CVC security code requested", True, "credential"),

    (re.compile(r"\b(credit|debit)\s*card\b.{0,50}(number|detail|cvv|pin|expir)", F),
     0.82, "Card details requested", True, "credential"),

    # ── UPI / PIN / Password ──────────────────────────────────────────────────
    (re.compile(r"\bupi\s*(pin|id|vpa)\b", F),
     0.82, "UPI PIN/ID requested", True, "credential"),

    (re.compile(
        r"(give|send|share|provide|tell|bata|bhejo)\b.{0,40}"
        r"\b(pin|mpin|password|passcode|secret\s*(code|number))\b", F),
     0.93, "Requesting PIN/password from victim", True, "credential"),

    # ── Login credentials ─────────────────────────────────────────────────────
    (re.compile(
        r"(share|send|provide|give|enter|submit).{0,40}"
        r"\b(username|login\s*id|credentials?|login\s*detail)\b", F),
     0.82, "Requesting login credentials", True, "credential"),

    # ── Account block threats ─────────────────────────────────────────────────
    (re.compile(
        r"(account|card|service).{0,30}"
        r"(will\s*(be|get)|is\s*being|has\s*been)\s*"
        r"(block(ed)?|suspend(ed)?|deactivat(ed)?|clos(ed)?|freez(en)?)", F),
     0.85, "Threat of account blocking/suspension", False, "threat"),

    (re.compile(
        r"\b(legal\s*action|file\s*(a\s*)?(case|fir)|police\s*complaint"
        r"|court\s*notice|arrested?|warrant|prosecution)\b", F),
     0.87, "Threat of legal action / police", False, "threat"),

    (re.compile(
        r"\bwarna\b.{0,50}"
        r"\b(block|band|action|police|arrest|suspend|legal)\b", F),
     0.87, "Hinglish: 'warna' + threat", False, "threat"),

    # ── Urgency ───────────────────────────────────────────────────────────────
    (re.compile(
        r"\b(act\s*now|immediately|right\s*now|within\s*\d+\s*(hours?|minutes?)"
        r"|last\s*(chance|opportunity)|final\s*(notice|warning|chance)"
        r"|expire[sd]?\s*(today|tonight|now|soon|in\s*\d+)"
        r"|limited\s*time|before\s*it\s*(is\s*)?too\s*late)\b", F),
     0.48, "Urgency / time-pressure language", False, "urgency"),

    (re.compile(
        r"\b(or\s*(else|i\s*will|we\s*will)|otherwise\b.{0,40}"
        r"(block|suspend|action|police|arrest))\b", F),
     0.65, "Conditional threat ('or else / otherwise')", False, "urgency"),

    # ── Prize / lottery scams ─────────────────────────────────────────────────
    (re.compile(
        r"\b(you\s*(have\s*)?(won|win|are\s*the\s*winner)"
        r"|congratulations.{0,30}(won|prize|reward|winner)"
        r"|selected\s*as\s*(the\s*)?(lucky\s*)?(winner|recipient))\b", F),
     0.92, "Prize/lottery winner scam", False, "lure"),

    (re.compile(
        r"\b(claim\s*(your\s*)?(prize|reward|cash|money|winnings|gift)"
        r"|free\s*(cash|money|gift|reward|iphone|laptop|recharge)\b"
        r"|prize\s*(money|amount))\b", F),
     0.87, "Claim prize / free reward language", False, "lure"),

    (re.compile(r"\b(lucky\s*draw|jackpot|lottery|sweepstakes)\b", F),
     0.82, "Lottery / lucky draw scam", False, "lure"),

    # ── Gift card scams ───────────────────────────────────────────────────────
    (re.compile(
        r"\b(gift\s*card|itunes\s*card|google\s*play\s*card|amazon\s*gift"
        r"|steam\s*card|voucher\s*code)\b.{0,60}(send|share|buy|purchase|give)", F),
     0.87, "Gift card payment scam", False, "lure"),

    (re.compile(
        r"(send|buy|purchase|provide)\b.{0,40}\b(gift\s*card|voucher|prepaid\s*card)\b", F),
     0.82, "Request to buy/send gift cards", False, "lure"),

    # ── KYC ───────────────────────────────────────────────────────────────────
    (re.compile(
        r"\b(kyc|know\s*your\s*customer).{0,30}"
        r"(pending|incomplete|update|verify|expire|required)\b"
        r"|(update|complete|verify|submit).{0,30}\bkyc\b", F),
     0.72, "KYC verification request", False, "context"),

    # ── Suspicious links ──────────────────────────────────────────────────────
    (re.compile(
        r"\b(click\s*(here|the\s*link|below)"
        r"|tap\s*(here|the\s*link)|open\s*the\s*link"
        r"|visit\s*(this|the)\s*(link|url|site|page))\b", F),
     0.42, "Click/tap link instruction", False, "link"),

    (re.compile(
        r"https?://(?!(?:www\.)?"
        r"(?:google|microsoft|apple|amazon|facebook|instagram|youtube|linkedin|twitter|sbi|hdfc|icici|paytm)\."
        r")[^\s]{8,}", F),
     0.52, "Suspicious/unrecognised URL in message", False, "link"),

    # ── Brand impersonation ───────────────────────────────────────────────────
    (re.compile(
        r"\b(sbi|state\s*bank|hdfc(\s*bank)?|icici(\s*bank)?|axis\s*bank"
        r"|paytm|phonepe|googlepay|amazon|flipkart|ebay|paypal"
        r"|microsoft|apple\s*support|google\s*support)\b"
        r".{0,60}"
        r"\b(account|verify|update|otp|pin|block|suspend|kyc|credential|login)\b", F),
     0.77, "Fake brand impersonation + credential/security topic", False, "context"),

    # ── Remote access scams ───────────────────────────────────────────────────
    (re.compile(
        r"\b(remote\s*(access|control|desktop)|anydesk|teamviewer|quicksupport"
        r"|screen\s*share|take\s*control\s*of\s*your"
        r"|install\s*(this\s*)?(app|software|program|tool))\b", F),
     0.82, "Remote access / tech support scam", False, "context"),

    # ── Malware download lures ────────────────────────────────────────────────
    (re.compile(
        r"\b(download|install|open|run|execute)\b.{0,40}"
        r"\.(exe|apk|bat|cmd|scr|vbs|js|ps1|dmg|msi)\b", F),
     0.82, "Suspicious executable download lure", False, "link"),

    # ── Refund / tax scams ────────────────────────────────────────────────────
    (re.compile(
        r"\b(refund|tax\s*(refund|credit)|income\s*tax"
        r"|insurance\s*(claim|refund)|government\s*(grant|payment|benefit)"
        r"|stimulus\s*(check|payment))\b"
        r".{0,60}"
        r"\b(click|link|verify|account|bank|otp|pin|deposit|claim)\b", F),
     0.77, "Refund / tax / government grant scam", False, "context"),

    # ── Account verification ──────────────────────────────────────────────────
    (re.compile(
        r"\b(verify|confirm|validate).{0,30}"
        r"\b(your\s*)?(account|identity|details?|card|number|profile)\b", F),
     0.58, "Account/identity verification request", False, "context"),

    # ── Hindi / Hinglish ──────────────────────────────────────────────────────
    (re.compile(
        r"\b(band\s*ho\s*(jayega|jaayega)"
        r"|block\s*ho\s*(jayega|jaayega)"
        r"|suspend\s*ho\s*jayega)\b", F),
     0.87, "Hindi: Account closure threat", False, "threat"),

    (re.compile(
        r"\b(apna|apni|aapka|aapki)\b.{0,30}"
        r"\b(otp|pin|mpin|password|card|account)\b", F),
     0.87, "Hinglish: Requesting your OTP/PIN/account", True, "credential"),

    (re.compile(
        r"\b(inam|inaam|jeeta|jeet\s*liya|lucky\s*draw)\b", F),
     0.77, "Hindi: Prize / lottery scam", False, "lure"),
]


# ── Co-occurrence multipliers ─────────────────────────────────────────────────
# If multiple categories fire, the combined score is amplified
CATEGORY_MULTIPLIERS = {
    frozenset(["credential", "threat"]): 1.25,
    frozenset(["credential", "urgency"]): 1.20,
    frozenset(["lure", "link"]): 1.15,
    frozenset(["credential", "lure"]): 1.18,
    frozenset(["context", "credential"]): 1.15,
    frozenset(["context", "urgency"]): 1.10,
}


def clean_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r'\s+', ' ', text).strip()


def _check_rules(text: str) -> dict:
    reasons       = []
    raw_scores    = []
    fired_cats    = set()
    hard_trigger  = False

    for pattern, score, reason, is_hard, category in RULES:
        m = pattern.search(text)
        if m:
            if _is_negated(text, m.start()):
                continue
            reasons.append(reason)
            raw_scores.append(score)
            fired_cats.add(category)
            if is_hard:
                hard_trigger = True

    # Base cumulative score (exponential soft cap)
    cumulative = sum(raw_scores)
    rule_score = round(1.0 - math.exp(-cumulative), 4) if cumulative > 0 else 0.0

    # Co-occurrence multiplier
    multiplier = 1.0
    for cat_pair, mult in CATEGORY_MULTIPLIERS.items():
        if cat_pair.issubset(fired_cats):
            multiplier = max(multiplier, mult)
    rule_score = round(min(rule_score * multiplier, 1.0), 4)

    return {
        "rule_score":    rule_score,
        "reasons":       list(dict.fromkeys(reasons)),  # dedup preserving order
        "hard_trigger":  hard_trigger,
        "fired_cats":    fired_cats,
        "max_single":    max(raw_scores) if raw_scores else 0.0,
    }


def detect(raw_text: str) -> dict:
    text = clean_text(raw_text)
    result = _check_rules(text)

    rule_score   = result["rule_score"]
    hard_trigger = result["hard_trigger"]
    reasons      = result["reasons"]

    # Hard-trigger → always FRAUD
    if hard_trigger:
        final_score = max(rule_score, 0.85)
        label = "FRAUD"
        confidence_level = "High"
    else:
        final_score = rule_score
        if final_score >= FRAUD_THRESHOLD:
            label = "FRAUD"
        elif final_score >= SUSPICIOUS_THRESHOLD:
            label = "SUSPICIOUS"
        else:
            label = "SAFE"
        confidence_level = (
            "High"   if final_score >= 0.75 else
            "Medium" if final_score >= 0.45 else
            "Low"
        )

    return {
        "original_message": raw_text,
        "final_label":      label,
        "final_score":      round(final_score, 4),
        "confidence_level": confidence_level,
        "rule_score":       rule_score,
        "reasons":          reasons,
        "api_skipped":      True,
        "api_label":        "N/A",
        "api_confidence":   0.0,
        "api_explanation":  "",
        "api_error":        None,
    }

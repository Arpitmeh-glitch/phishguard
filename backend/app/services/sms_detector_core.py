#!/usr/bin/env python3
"""
Production-Ready Phishing / Fraud Detection System
====================================================
Combines:
  1. Rule-based detection (keyword + pattern scoring)
  2. OpenAI API intelligent classification (gpt-4o-mini)
  3. Hybrid decision logic

Usage:
  python phishing_detector.py               # interactive CLI
  python phishing_detector.py --debug       # debug mode
  python phishing_detector.py --test        # run built-in test cases
  OPENAI_API_KEY=sk-... python phishing_detector.py
"""

import os
import re
import sys
import json
import argparse
import unicodedata
from typing import Optional

# ── Optional dependencies (graceful fallbacks) ──────────────────────────────
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    print("[WARN] openai package not found. Install: pip install openai")

try:
    from deep_translator import GoogleTranslator
    TRANSLATOR_AVAILABLE = True
except ImportError:
    TRANSLATOR_AVAILABLE = False

# ── Constants ────────────────────────────────────────────────────────────────
FRAUD_THRESHOLD      = 0.6
SUSPICIOUS_THRESHOLD = 0.3

DEBUG_MODE = False   # toggled via --debug flag

# ── Rule Definitions ─────────────────────────────────────────────────────────
# Each entry: (compiled_regex, score_contribution, human_readable_reason)
#
# Design principles:
#   • Use word-boundary-free matches where the threat phrase spans multiple words
#   • Allow flexible spacing/punctuation between key terms with .{0,N}
#   • Cover BOTH directions: "give me your X" AND "send your X to me"
#   • Cover abbreviated / typo variants common in SMS scams
#   • Each pattern is tested against real-world phishing samples
# ─────────────────────────────────────────────────────────────────────────────

F   = re.I   # shorthand

RULES = [

    # ════════════════════════════════════════════════════════
    # 1. OTP / One-Time Password
    # ════════════════════════════════════════════════════════

    # "give me your otp", "send otp", "share the otp", "bata otp"
    (re.compile(
        r"(give|send|share|provide|tell|bata|bhejo|batao|dedo|chahiye|bhejiye|bataiye|dijiye|de do)\b.{0,40}\botp\b"
        r"|\botp\b.{0,40}(give|send|share|provide|bhejo|batao)",
        F), 0.90, "Requesting OTP from victim"),

    # Any standalone OTP mention (lower weight — context clue)
    (re.compile(r"\botp\b", F), 0.40, "OTP keyword present"),

    # "one time password", "one-time code", "verification code"
    (re.compile(
        r"\bone[\s\-]?time[\s\-]?(pass(word)?|code|pin)\b"
        r"|\bverification[\s\-]?(code|number|pin)\b",
        F), 0.70, "One-time / verification code requested"),

    # ════════════════════════════════════════════════════════
    # 2. Bank / Account / Financial Details
    # ════════════════════════════════════════════════════════

    # "give me your bank details", "share bank account", "send your account number"
    (re.compile(
        r"(give|send|share|provide|tell|submit|enter|type|fill).{0,40}"
        r"(bank\s*(detail|account|info|number|data)|account\s*(number|detail|info|no))",
        F), 0.85, "Requesting bank/account details"),

    # Standalone bank detail keywords — strong indicators in SMS context
    (re.compile(r"\bbank\s*(detail|info|account\s*number|data)\b", F), 0.65,
     "Bank detail keywords present"),

    # IFSC, sort code, routing number
    (re.compile(r"\b(ifsc|sort[\s\-]?code|routing[\s\-]?number)\b", F), 0.65,
     "Bank routing/IFSC code requested"),

    # ════════════════════════════════════════════════════════
    # 3. Card Details (credit/debit)
    # ════════════════════════════════════════════════════════

    (re.compile(r"\b(credit|debit)\s*card\b.{0,50}(number|detail|info|cvv|pin|expir)", F), 0.80,
     "Credit/debit card details requested"),

    (re.compile(r"\b(cvv|cvc2?|card\s*verification\s*(value|code))\b", F), 0.90,
     "CVV/CVC (card security code) requested"),

    (re.compile(r"\b(expir(y|ation|ation\s*date)|valid\s*(thru|through|till|upto))\b", F), 0.55,
     "Card expiry date mentioned"),

    # ════════════════════════════════════════════════════════
    # 4. UPI / PIN / Password / mPIN
    # ════════════════════════════════════════════════════════

    (re.compile(r"\bupi\s*(pin|id|handle|address|vpa)\b", F), 0.80,
     "UPI PIN/ID requested"),

    # "give me your pin", "send password", "share mpin", "tell me the pin"
    (re.compile(
        r"(give|send|share|provide|tell|bata|batao|bhejo|dedo)\b.{0,40}"
        r"\b(pin|mpin|m\s*pin|password|passcode|secret\s*(code|number))\b",
        F), 0.90, "Requesting PIN / password / mPIN from victim"),

    # Standalone mention (lower weight)
    (re.compile(r"\b(mpin|m[\s\-]?pin)\b", F), 0.45, "mPIN keyword present"),

    # ════════════════════════════════════════════════════════
    # 5. Threats — Account Blocking / Suspension
    # ════════════════════════════════════════════════════════

    # "i will block your account", "we will suspend", "account will be blocked",
    # "account blocked", "your account is being deactivated"
    (re.compile(
        r"(i\s*(will|am\s*going\s*to|shall|would)|we\s*(will|shall|are\s*going\s*to))"
        r".{0,30}(block|suspend|deactivat|clos|freez|terminat).{0,20}(account|card|service)",
        F), 0.85, "Direct threat to block/suspend account"),

    (re.compile(
        r"(account|card|service|number).{0,30}"
        r"(will\s*(be|get)|is\s*(being|getting)|has\s*been|shall\s*be|gets?)\s*"
        r"(block(ed)?|suspend(ed)?|deactivat(ed)?|clos(ed)?|freez(en)?|terminat(ed)?)",
        F), 0.85, "Threat of account blocking/suspension/closure"),

    # Short form threats
    (re.compile(
        r"\b(block(ed)?|suspend(ed)?|deactivat(ed)?|freez(en)?)\b.{0,30}\b(account|card|number|service)\b"
        r"|\b(account|card|number|service)\b.{0,30}\b(block(ed)?|suspend(ed)?|deactivat(ed)?|freez(en)?)\b",
        F), 0.75, "Account block/suspension language"),

    # ════════════════════════════════════════════════════════
    # 6. Threats — Legal / Authority
    # ════════════════════════════════════════════════════════

    (re.compile(
        r"\b(legal\s*action|file\s*(a\s*)?(case|complaint|fir)|police\s*complaint"
        r"|court\s*notice|arrested?|warrant|prosecution|cybercrime)\b",
        F), 0.85, "Threat of legal action / police / court"),

    # ════════════════════════════════════════════════════════
    # 7. Urgency / Pressure Language
    # ════════════════════════════════════════════════════════

    (re.compile(
        r"\b(act\s*now|immediately|right\s*now|do\s*it\s*now|within\s*\d+\s*(hours?|minutes?|mins?|hrs?)"
        r"|last\s*(chance|opportunity)|final\s*(notice|warning|chance)"
        r"|expire[sd]?\s*(today|tonight|now|soon|in\s*\d+)"
        r"|limited\s*time|before\s*it\s*(is\s*)?too\s*late)\b",
        F), 0.50, "Urgency / time-pressure language"),

    # "or else", "otherwise" combined with threat — strong signal
    (re.compile(
        r"\b(or\s*(else|i\s*will|we\s*will|your\s*account)|otherwise\b.{0,40}"
        r"(block|suspend|action|police|arrest))",
        F), 0.65, "Conditional threat ('or else / otherwise')"),

    # ════════════════════════════════════════════════════════
    # 8. KYC / Verification Requests
    # ════════════════════════════════════════════════════════

    (re.compile(
        r"\b(kyc|know\s*your\s*customer).{0,30}"
        r"(pending|incomplete|update|verify|expire|required|mandatory)\b"
        r"|(update|complete|verify|submit).{0,30}\bkyc\b",
        F), 0.70, "KYC verification request"),

    # ════════════════════════════════════════════════════════
    # 9. Prize / Lottery / Reward Scams
    # ════════════════════════════════════════════════════════

    (re.compile(
        r"\b(you\s*(have\s*)?(won|win|are\s*the\s*winner)"
        r"|congratulations.{0,30}(won|prize|reward|winner|selected)"
        r"|selected\s*as\s*(the\s*)?(lucky\s*)?(winner|recipient))\b",
        F), 0.90, "Prize/lottery winner scam language"),

    (re.compile(
        r"\b(claim\s*(your\s*)?(prize|reward|cash|money|winnings|gift|offer)"
        r"|free\s*(cash|money|gift|reward|iphone|laptop|recharge)\b"
        r"|prize\s*(money|amount|of\s*rs\.?))\b",
        F), 0.85, "Claim prize / free reward language"),

    (re.compile(r"\b(lucky\s*draw|jackpot|lottery|sweepstakes|raffle)\b", F), 0.80,
     "Lottery / lucky draw scam"),

    # ════════════════════════════════════════════════════════
    # 10. Phishing Links / Actions
    # ════════════════════════════════════════════════════════

    (re.compile(
        r"\b(click\s*(here|the\s*link|on\s*the\s*link|below|this)"
        r"|tap\s*(here|the\s*link|below)"
        r"|open\s*the\s*link|visit\s*(this|the)\s*(link|url|site|website|page))\b",
        F), 0.45, "Click/tap link instruction"),

    # Suspicious shortened or non-branded URLs
    (re.compile(
        r"https?://(?!(?:www\.)?"
        r"(?:google|microsoft|apple|amazon|facebook|instagram|youtube|linkedin|twitter|sbi|hdfc|icici|paytm)\."
        r")[^\s]{8,}",
        F), 0.55, "Suspicious / unrecognised URL"),

    # ════════════════════════════════════════════════════════
    # 11. Verify / Update Account / Identity
    # ════════════════════════════════════════════════════════

    (re.compile(
        r"\b(verify|confirm|validate).{0,30}"
        r"\b(your\s*)?(account|identity|details?|information|card|number|profile)\b",
        F), 0.60, "Account/identity verification request"),

    (re.compile(
        r"\b(update|re\s*?enter|re\s*?submit|fill\s*(in|out)?).{0,30}"
        r"\b(your\s*)?(detail|info|card|payment|bank|personal|account)\b",
        F), 0.55, "Request to update/re-enter personal details"),

    # ════════════════════════════════════════════════════════
    # 12. Personal Identifiers (Aadhaar / PAN / Passport)
    # ════════════════════════════════════════════════════════

    (re.compile(r"\b(aadhaar|aadhar|adhar)\b", F), 0.65,
     "Aadhaar number mentioned"),

    (re.compile(r"\bpan\s*(card|number|no\.?)\b", F), 0.60,
     "PAN card number requested"),

    (re.compile(r"\bpassport\s*(number|no\.?|detail)\b", F), 0.55,
     "Passport number requested"),

    (re.compile(r"\b(date\s*of\s*birth|d\.?o\.?b\.?|mother\s*'?s?\s*(maiden\s*name|name))\b", F), 0.50,
     "Sensitive personal identifier (DOB / mother's name) requested"),

    # ════════════════════════════════════════════════════════
    # 13. Hindi / Hinglish Patterns
    # ════════════════════════════════════════════════════════

    # Account / bank in Hindi
    (re.compile(r"\b(khata|bank\s*khata|khata\s*(number|no))\b", F), 0.60,
     "Hindi: Bank account (khata) mentioned"),

    # Threats in Hindi/Hinglish
    (re.compile(
        r"\b(band\s*ho\s*(jayega|jaayega|jaega)"
        r"|block\s*ho\s*(jayega|jaayega|jaega)"
        r"|band\s*kar\s*(denge|diya\s*jayega|diya\s*jaayega)"
        r"|suspend\s*ho\s*(jayega|jaayega))\b",
        F), 0.85, "Hindi: Threat of account closure/block"),

    # Money / prize in Hindi
    (re.compile(
        r"\b(paise|paisa)\b.{0,30}"
        r"\b(transfer|bhejo|bheje|mile\s*ge|milenge|jeet|mila)\b",
        F), 0.70, "Hindi: Money transfer / prize mentioned"),

    (re.compile(r"\b(inam|inaam|jeeta|jeet\s*liya|lucky\s*draw)\b", F), 0.75,
     "Hindi: Prize / lottery (inam/jeeta)"),

    # Urgency in Hinglish
    (re.compile(
        r"\b(abhi|turant|jaldi|fatafat)\b.{0,30}"
        r"\b(karo|karen|kijiye|dijiye|bhejo|batao|dedo)\b",
        F), 0.50, "Hinglish: Urgency — act immediately"),

    # "Apna OTP/PIN/password bhejiye" — asking for credentials in Hinglish
    (re.compile(
        r"\b(apna|apni|aapka|aapki|aap\s*ka|apke)\b.{0,30}"
        r"\b(otp|pin|mpin|password|card|khata|account)\b",
        F), 0.85, "Hinglish: Requesting your OTP/PIN/account"),

    # Verify in Hindi imperative
    (re.compile(
        r"\b(verify|verification)\b.{0,30}\b(karein|karo|kijiye|karna\s*hai)\b",
        F), 0.55, "Hinglish: Verify (Hindi imperative)"),

    # "warna" (otherwise) + threat — very strong signal
    (re.compile(
        r"\bwarna\b.{0,50}"
        r"\b(block|band|action|police|arrest|suspend|legal|court)\b",
        F), 0.85, "Hinglish: 'warna' (otherwise) + threat"),

]

# ── Language Detection ────────────────────────────────────────────────────────
HINDI_UNICODE_RANGE = re.compile(r'[\u0900-\u097F]')
URDU_UNICODE_RANGE  = re.compile(r'[\u0600-\u06FF]')
HINGLISH_MARKERS    = re.compile(
    r'\b(karo|karna|hai|hain|nahi|nhi|bhai|yaar|abhi|turant|jaldi|batao|bhejo|dijiye|milega|milenge|aapka|apna|khata|paise|paisa|inam|band)\b',
    re.I
)

def detect_language(text: str) -> str:
    """Detect language: hindi | urdu | hinglish | english"""
    if HINDI_UNICODE_RANGE.search(text):
        return "hindi"
    if URDU_UNICODE_RANGE.search(text):
        return "urdu"
    if HINGLISH_MARKERS.search(text):
        return "hinglish"
    return "english"


# ── Text Cleaning ─────────────────────────────────────────────────────────────
def clean_text(text: str) -> str:
    """Normalize Unicode, strip extra whitespace, lowercase for matching."""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


# ── Translation ───────────────────────────────────────────────────────────────
def translate_to_english(text: str, language: str) -> str:
    """Translate Hindi/Urdu/Hinglish to English using deep-translator if available."""
    if language == "english":
        return text
    if not TRANSLATOR_AVAILABLE:
        if DEBUG_MODE:
            print(f"  [DEBUG] Translator unavailable; skipping translation for '{language}'")
        return text
    try:
        src_map = {"hindi": "hi", "urdu": "ur", "hinglish": "hi"}
        src = src_map.get(language, "auto")
        translated = GoogleTranslator(source=src, target="en").translate(text)
        if DEBUG_MODE:
            print(f"  [DEBUG] Translated ({language} → en): {translated}")
        return translated
    except Exception as exc:
        if DEBUG_MODE:
            print(f"  [DEBUG] Translation error: {exc}")
        return text


# ── Rule Engine ───────────────────────────────────────────────────────────────
def check_rules(text: str) -> dict:
    """
    Apply all rules to text.
    Returns:
        rule_score  : float 0-1 (capped)
        reasons     : list of matched reason strings
        matched_count : int
    """
    reasons = []
    cumulative_score = 0.0

    for pattern, score, reason in RULES:
        if pattern.search(text):
            reasons.append(f"{reason} (+{score:.2f})")
            cumulative_score += score
            if DEBUG_MODE:
                print(f"  [DEBUG] Rule match: '{reason}' score={score:.2f}")

    # Soft-cap with diminishing returns: score = 1 - e^(-x)
    import math
    rule_score = 1.0 - math.exp(-cumulative_score) if cumulative_score > 0 else 0.0
    rule_score = round(min(rule_score, 1.0), 4)

    return {
        "rule_score": rule_score,
        "reasons": reasons,
        "matched_count": len(reasons),
    }


# ── OpenAI API Integration ────────────────────────────────────────────────────
def call_openai_api(text: str) -> dict:
    """
    Call OpenAI GPT to classify text as Fraud / Suspicious / Safe.
    Returns:
        label       : str  (Fraud | Suspicious | Safe | Unknown)
        confidence  : float 0-1
        explanation : str
        error       : str or None
    """
    if not OPENAI_AVAILABLE:
        return {"label": "Unknown", "confidence": 0.0, "explanation": "OpenAI not installed.", "error": "openai package missing"}

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return {"label": "Unknown", "confidence": 0.0, "explanation": "No API key.", "error": "OPENAI_API_KEY not set"}

    system_prompt = (
        "You are a fraud and phishing detection expert. "
        "Analyze the following message and classify it.\n\n"
        "Respond ONLY with a valid JSON object (no markdown, no extra text) with exactly these keys:\n"
        '  "label": one of "Fraud", "Suspicious", or "Safe"\n'
        '  "confidence": a float between 0 and 1\n'
        '  "explanation": a concise one-sentence reason\n\n'
        "Indicators of Fraud: requesting OTP, PIN, CVV, passwords, bank details, UPI credentials; "
        "threatening account suspension or legal action; prize/lottery scams; fake verification requests; "
        "urgent language designed to panic the victim.\n"
        "Indicators of Safe: normal greetings, everyday questions, legitimate business communication."
    )

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Message to analyze:\n\n{text}"},
            ],
            temperature=0.0,
            max_tokens=200,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content.strip()
        if DEBUG_MODE:
            print(f"  [DEBUG] OpenAI raw response: {raw}")
        data = json.loads(raw)

        label      = data.get("label", "Unknown")
        confidence = float(data.get("confidence", 0.5))
        explanation = data.get("explanation", "No explanation provided.")

        # Normalise label casing
        label = label.capitalize()
        if label not in ("Fraud", "Suspicious", "Safe"):
            label = "Unknown"

        return {"label": label, "confidence": round(confidence, 4), "explanation": explanation, "error": None}

    except json.JSONDecodeError as e:
        return {"label": "Unknown", "confidence": 0.5, "explanation": "Could not parse API response.", "error": str(e)}
    except Exception as e:
        return {"label": "Unknown", "confidence": 0.0, "explanation": "API call failed.", "error": str(e)}


# ── Hybrid Score Combination ──────────────────────────────────────────────────
def combine_scores(rule_result: dict, api_result: Optional[dict]) -> dict:
    """
    Combine rule score and (optional) API confidence into final classification.
    Logic:
      - If rule_score >= 0.4 → skip API (strong rule match = Fraud)
      - Otherwise → use API confidence
      - final_score = max(rule_score, api_confidence)
      - >= 0.6  → Fraud
      - 0.3–0.6 → Suspicious
      - < 0.3   → Safe
    """
    rule_score  = rule_result["rule_score"]
    api_skipped = (api_result is None)

    api_label       = api_result["label"]       if api_result else "N/A"
    api_confidence  = api_result["confidence"]  if api_result else 0.0
    api_explanation = api_result["explanation"] if api_result else ""
    api_error       = api_result["error"]       if api_result else None

    if api_skipped:
        final_score = rule_score
    else:
        final_score = max(rule_score, api_confidence)

    final_score = round(final_score, 4)

    if final_score >= FRAUD_THRESHOLD:
        final_label = "FRAUD"
    elif final_score >= SUSPICIOUS_THRESHOLD:
        final_label = "SUSPICIOUS"
    else:
        final_label = "SAFE"

    if final_score >= 0.75:
        confidence_level = "High"
    elif final_score >= 0.45:
        confidence_level = "Medium"
    else:
        confidence_level = "Low"

    return {
        "final_score":       final_score,
        "final_label":       final_label,
        "confidence_level":  confidence_level,
        "api_label":         api_label,
        "api_confidence":    api_confidence,
        "api_explanation":   api_explanation,
        "api_error":         api_error,
        "api_skipped":       api_skipped,
    }


# ── Main Detection Pipeline ───────────────────────────────────────────────────
def detect(raw_text: str) -> dict:
    """
    Full detection pipeline.
    Steps: clean → detect language → translate → rule check → (optional) API → combine
    Returns a result dict suitable for print_result().
    """
    text     = clean_text(raw_text)
    language = detect_language(text)

    if DEBUG_MODE:
        print(f"\n  [DEBUG] Cleaned text : {text}")
        print(f"  [DEBUG] Language     : {language}")

    # Translate non-English text for rule matching + API
    translated_text = translate_to_english(text, language)

    # Run rules on both original and translated text (union of matches)
    rule_orig        = check_rules(text)
    rule_translated  = check_rules(translated_text) if translated_text != text else rule_orig

    # Merge rule results
    combined_reasons = list(dict.fromkeys(rule_orig["reasons"] + rule_translated["reasons"]))
    combined_score   = max(rule_orig["rule_score"], rule_translated["rule_score"])

    rule_result = {
        "rule_score":     combined_score,
        "reasons":        combined_reasons,
        "matched_count":  len(combined_reasons),
    }

    if DEBUG_MODE:
        print(f"  [DEBUG] Rule score   : {combined_score}")
        print(f"  [DEBUG] Reasons      : {combined_reasons}")

    # Decide whether to call OpenAI
    api_result = None
    if combined_score < 0.4:
        # Rules are weak — get AI opinion
        api_result = call_openai_api(translated_text)
        if DEBUG_MODE:
            print(f"  [DEBUG] API result   : {api_result}")
    else:
        if DEBUG_MODE:
            print(f"  [DEBUG] Strong rule match ({combined_score:.2f} >= 0.4). Skipping API.")

    combined = combine_scores(rule_result, api_result)

    return {
        "original_message": raw_text,
        "language":         language,
        "rule_score":       rule_result["rule_score"],
        "reasons":          rule_result["reasons"],
        **combined,
    }


# ── Output Formatter ──────────────────────────────────────────────────────────
# ANSI colour codes
_C = {
    "red":    "\033[91m",
    "yellow": "\033[93m",
    "green":  "\033[92m",
    "cyan":   "\033[96m",
    "bold":   "\033[1m",
    "reset":  "\033[0m",
    "gray":   "\033[90m",
}

def _colour(text: str, *codes: str) -> str:
    """Wrap text in ANSI codes (disabled on Windows without ANSI support or when redirected)."""
    if not sys.stdout.isatty():
        return text
    prefix = "".join(_C.get(c, "") for c in codes)
    return f"{prefix}{text}{_C['reset']}"


def print_result(result: dict) -> None:
    """Pretty-print a detection result to stdout."""
    label   = result["final_label"]
    fscore  = result["final_score"]
    clevel  = result["confidence_level"]

    label_colour = {
        "FRAUD":      ("red",    "bold"),
        "SUSPICIOUS": ("yellow", "bold"),
        "SAFE":       ("green",  "bold"),
    }.get(label, ("cyan",))

    print()
    print(_colour("═" * 60, "bold"))
    print(_colour("  PHISHING / FRAUD DETECTION RESULT", "bold", "cyan"))
    print(_colour("═" * 60, "bold"))

    print(f"  {'Message':<18}: {result['original_message']}")
    print(f"  {'Language':<18}: {result['language'].capitalize()}")
    print()
    print(f"  {'Rule Score':<18}: {result['rule_score']:.4f}")
    if not result["api_skipped"]:
        api_err = f"  ⚠ {result['api_error']}" if result["api_error"] else ""
        print(f"  {'API Label':<18}: {result['api_label']} (conf={result['api_confidence']:.4f}){api_err}")
        if result["api_explanation"]:
            print(f"  {'API Reason':<18}: {result['api_explanation']}")
    else:
        print(f"  {'API':<18}: {_colour('Skipped (strong rule match)', 'gray')}")

    print()
    print(f"  {'Final Score':<18}: {fscore:.4f}")
    print(f"  {'Classification':<18}: {_colour(label, *label_colour)}")
    print(f"  {'Confidence Level':<18}: {clevel}")

    if result["reasons"]:
        print()
        print(_colour("  Detection Reasons:", "bold"))
        for r in result["reasons"]:
            print(f"    • {r}")
    else:
        print(f"\n  {_colour('No specific rule triggers.', 'gray')}")

    print(_colour("═" * 60, "bold"))
    print()


# ── Built-in Test Cases ───────────────────────────────────────────────────────
TEST_CASES = [
    # (message, expected_label)
    # ── Safe messages ──────────────────────────────────────────────────────
    ("hi",                                                                    "SAFE"),
    ("Hey, can you recommend a good Python book?",                           "SAFE"),
    ("Your order has been shipped. Track it at amazon.com/track",            "SAFE"),

    # ── The exact failing message from the bug report ──────────────────────
    ("give me your bank details or i will block your account",               "FRAUD"),

    # ── Variants previously missed ─────────────────────────────────────────
    ("send me your otp",                                                      "FRAUD"),
    ("I will block your account if you don't comply",                        "FRAUD"),
    ("We will suspend your account immediately",                             "FRAUD"),
    ("Your account gets blocked unless you verify now",                      "FRAUD"),
    ("Share your password or else we take legal action",                     "FRAUD"),

    # ── Standard phishing ──────────────────────────────────────────────────
    ("your account will be blocked click here",                              "FRAUD"),
    ("Congratulations! You have won Rs 5,00,000 in our lucky draw. "
     "Click here to claim your prize now!",                                  "FRAUD"),
    ("Your KYC is pending. Update your Aadhaar and CVV details "
     "immediately to avoid account suspension.",                             "FRAUD"),

    # ── Hindi / Hinglish ───────────────────────────────────────────────────
    ("Aapka bank account band ho jayega. Abhi apna OTP aur PIN "
     "bhejiye warna legal action hoga.",                                     "FRAUD"),
    ("Aapka khata band kar denge agar aap abhi verify nahi karte",           "FRAUD"),
]


def run_tests() -> None:
    """Run all built-in test cases and show pass/fail."""
    print(_colour("\n  ── RUNNING TEST CASES ──\n", "bold", "cyan"))
    passed = 0
    failed = 0
    for i, (msg, expected) in enumerate(TEST_CASES, 1):
        print(_colour(f"  TEST {i}/{len(TEST_CASES)}", "bold"))
        result = detect(msg)
        print_result(result)
        got = result["final_label"]
        if got == expected:
            print(_colour(f"  ✓ PASS  (expected {expected})\n", "green", "bold"))
            passed += 1
        else:
            print(_colour(f"  ✗ FAIL  (expected {expected}, got {got})\n", "red", "bold"))
            failed += 1
    print(_colour(f"\n  Results: {passed} passed, {failed} failed out of {len(TEST_CASES)} tests\n",
                  "bold"))


# ── CLI Interactive Mode ──────────────────────────────────────────────────────
def interactive_mode() -> None:
    """Run an interactive CLI loop."""
    print(_colour("\n  ╔══════════════════════════════════════════╗", "cyan", "bold"))
    print(_colour("  ║   Phishing & Fraud Detection System      ║", "cyan", "bold"))
    print(_colour("  ║   Type 'quit' or Ctrl+C to exit          ║", "cyan", "bold"))
    print(_colour("  ╚══════════════════════════════════════════╝\n", "cyan", "bold"))

    while True:
        try:
            user_input = input(_colour("  Enter message to analyze: ", "bold")).strip()
        except (KeyboardInterrupt, EOFError):
            print("\n  Exiting.")
            break

        if not user_input:
            continue
        if user_input.lower() in ("quit", "exit", "q"):
            print("  Goodbye.")
            break

        result = detect(user_input)
        print_result(result)


# ── Entry Point ───────────────────────────────────────────────────────────────
def main():
    global DEBUG_MODE

    parser = argparse.ArgumentParser(description="Phishing & Fraud Detection System")
    parser.add_argument("--debug", action="store_true", help="Enable debug output")
    parser.add_argument("--test",  action="store_true", help="Run built-in test cases")
    args = parser.parse_args()

    DEBUG_MODE = args.debug

    if args.test:
        run_tests()
    else:
        interactive_mode()


if __name__ == "__main__":
    main()
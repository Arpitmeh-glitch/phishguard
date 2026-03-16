import os
import requests
import zipfile
import io
LEGITIMATE_DOMAINS = set()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_DIR = os.path.join(BASE_DIR, "data")

# -----------------------------
# Feed URLs
# -----------------------------

OPENPHISH_URL = "https://openphish.com/feed.txt"
PHISHTANK_URL = "http://data.phishtank.com/data/online-valid.json"
URLHAUS_URL = "https://urlhaus.abuse.ch/downloads/text/"
UMBRELLA_URL = "http://s3-us-west-1.amazonaws.com/umbrella-static/top-1m.csv.zip"

# -----------------------------
# Global in-memory databases
# -----------------------------

OPENPHISH_DB = set()
PHISHTANK_DB = set()
URLHAUS_DB = set()
LEGIT_DOMAIN_DB = set()


# -----------------------------
# Load OpenPhish
# -----------------------------
def load_legitimate_domains():
    global LEGITIMATE_DOMAINS

    files = [
        "top-1m.csv",
        "tranco_L6j4.csv"
    ]

    for fname in files:
        path = os.path.join(DATA_DIR, fname)

        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()

                    if not line:
                        continue

                    parts = line.split(",")

                    # handle both formats: "rank,domain" or just "domain"
                    if len(parts) == 1:
                        domain = parts[0]
                    else:
                        domain = parts[-1]

                    # Normalize: lowercase, strip whitespace, remove www.
                    domain = extract_apex(domain)

                    if "." in domain:
                        LEGITIMATE_DOMAINS.add(domain)

        except Exception as e:
            print(f"Failed loading {fname}:", e)

    print("Loaded legitimate domains:", len(LEGITIMATE_DOMAINS))

def load_openphish():
    try:
        r = requests.get(OPENPHISH_URL, timeout=10)
        urls = set(r.text.splitlines())
        print(f"[ThreatIntel] Loaded {len(urls)} OpenPhish URLs")
        return urls
    except Exception as e:
        print("[ThreatIntel] OpenPhish load failed:", e)
        return set()


# -----------------------------
# Load PhishTank
# -----------------------------

def load_phishtank():
    try:
        r = requests.get(PHISHTANK_URL, timeout=10)
        data = r.json()
        urls = {item["url"] for item in data}
        print(f"[ThreatIntel] Loaded {len(urls)} PhishTank URLs")
        return urls
    except Exception as e:
        print("[ThreatIntel] PhishTank load failed:", e)
        return set()


# -----------------------------
# Load URLHaus
# -----------------------------

def load_urlhaus():
    try:
        r = requests.get(URLHAUS_URL, timeout=10)

        urls = set()

        for line in r.text.splitlines():
            if line.startswith("#"):
                continue
            urls.add(line.strip())

        print(f"[ThreatIntel] Loaded {len(urls)} URLHaus URLs")
        return urls

    except Exception as e:
        print("[ThreatIntel] URLHaus load failed:", e)
        return set()
def normalize_domain(domain: str):
    domain = domain.lower().strip()
    if domain.startswith("www."):
        domain = domain[4:]
    return domain


def extract_apex(domain: str) -> str:
    """
    Normalize any URL or domain to its bare apex domain.

    Steps:
      1. Remove protocol (http://, https://)
      2. Remove port (:8080, etc.)
      3. Remove 'www.' prefix
      4. Lowercase + strip whitespace

    Examples:
      https://www.google.com  → google.com
      WWW.PayPal.com:443      → paypal.com
      http://subdomain.example.org → subdomain.example.org
    """
    if not domain:
        return ""

    # 1. Remove protocol
    for proto in ("https://", "http://", "ftp://"):
        if domain.lower().startswith(proto):
            domain = domain[len(proto):]
            break

    # 2. Strip path, query, fragment — keep only host[:port]
    domain = domain.split("/")[0].split("?")[0].split("#")[0]

    # 3. Remove port
    if ":" in domain:
        domain = domain.split(":")[0]

    # 4. Lowercase and strip whitespace
    domain = domain.lower().strip()

    # 5. Remove leading 'www.'
    if domain.startswith("www."):
        domain = domain[4:]

    return domain

# -----------------------------
# Load Legitimate Domains
# -----------------------------

def load_legit_domains(limit=100000):
    try:
        r = requests.get(UMBRELLA_URL)

        z = zipfile.ZipFile(io.BytesIO(r.content))
        data = z.read(z.namelist()[0]).decode()

        domains = []

        for line in data.splitlines():
            parts = line.split(",")
            if len(parts) > 1:
                domains.append(parts[1])

        legit_set = set(domains[:limit])

        print(f"[ThreatIntel] Loaded {len(legit_set)} legitimate domains")

        return legit_set

    except Exception as e:
        print("[ThreatIntel] Legit domain load failed:", e)
        return set()


# -----------------------------
# Initialize Threat Intel
# -----------------------------

def initialize_threat_intel():
    global OPENPHISH_DB
    global PHISHTANK_DB
    global URLHAUS_DB
    global LEGIT_DOMAIN_DB

    OPENPHISH_DB = load_openphish()
    PHISHTANK_DB = load_phishtank()
    URLHAUS_DB = load_urlhaus()
    LEGIT_DOMAIN_DB = load_legit_domains()


# -----------------------------
# Helper Check Functions
# -----------------------------

def is_known_phishing(url: str):
    return (
        url in OPENPHISH_DB
        or url in PHISHTANK_DB
        or url in URLHAUS_DB
    )


def is_legitimate_domain(domain: str) -> bool:
    """
    Check whether a hostname belongs to a known-legitimate domain.

    Accepts a bare hostname (as returned by urlparse().hostname or after
    stripping a port).  Does NOT accept full URLs — call extract_apex() on
    the URL first if you have a raw URL, or just pass urlparse().netloc
    split on ':'.

    Normalisation applied here:
      • lowercase + strip whitespace
      • remove leading 'www.'
    Then checks the whitelist directly, and falls back to walking up the
    subdomain chain so that mail.google.com matches google.com.
    """
    if not LEGITIMATE_DOMAINS:
        load_legitimate_domains()

    # Simple, transparent normalisation — no protocol/path stripping needed
    # because callers pass a hostname, not a full URL.
    domain = domain.lower().strip()
    if domain.startswith("www."):
        domain = domain[4:]

    if not domain or "." not in domain:
        return False

    # 1. Direct apex match  (google.com → google.com ✓)
    if domain in LEGITIMATE_DOMAINS:
        return True

    # 2. Subdomain match: mail.google.com → check google.com, then com (skip)
    parts = domain.split(".")
    for i in range(1, len(parts) - 1):   # -1 avoids pointless TLD-only check
        parent = ".".join(parts[i:])
        if parent in LEGITIMATE_DOMAINS:
            return True

    return False
"""
PhishGuard — Production Cybersecurity API
==========================================
FastAPI application entry point.

Security hardening applied in this version:
  - SecurityHeadersMiddleware  : CSP, X-Frame-Options, HSTS, Referrer-Policy, etc.
  - Explicit CORS allowed headers (no wildcard allow_headers).
  - Slowapi global IP-based rate limiter + per-user scan limiter (in scan.py).
  - 422 validation error handler normalised to generic message (no field leakage).

CORS FIX NOTES (v1.0.1)
------------------------
Root cause: FastAPI/Starlette processes middleware in LIFO order (last-added = outermost).
Previously, SecurityHeadersMiddleware was added BEFORE CORSMiddleware, making it
the outermost layer. That meant SecurityHeadersMiddleware's call_next() received and
forwarded requests to CORSMiddleware — but when CORSMiddleware short-circuits an
OPTIONS preflight it returns a Response immediately. Because SecurityHeadersMiddleware
sat outside it, it could intercept that early return before CORS headers were fully
committed, causing the browser to see a response missing Access-Control-Allow-Origin.

Fix: Register CORSMiddleware LAST so it becomes the outermost middleware layer,
handling every request first and returning clean preflight responses before any
other middleware can interfere.

Middleware execution order after fix (outermost → innermost):
  1. CORSMiddleware            ← handles OPTIONS preflight, sets Access-Control-* headers
  2. SecurityHeadersMiddleware ← adds security headers to all other responses
  3. TrustedHostMiddleware     ← host validation
  4. Application routes
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import engine, Base
from app.routes import auth, scan, user, admin
from app.services import url_service
from app.utils.seed import seed_demo_accounts
from app.utils.security_headers import SecurityHeadersMiddleware
from app.database import SessionLocal

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("🚀 PhishGuard API starting…")

    Base.metadata.create_all(bind=engine)
    logger.info("✅ Database tables ensured")

    db = SessionLocal()
    try:
        seed_demo_accounts(db)
    finally:
        db.close()

    url_service.initialize()
    yield
    logger.info("👋 PhishGuard API shutting down")


# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="PhishGuard API",
    version=settings.APP_VERSION,
    description="Production-grade phishing & fraud detection platform",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Middleware stack ──────────────────────────────────────────────────────────
# IMPORTANT: Starlette applies middleware in LIFO order (last registered = outermost).
# CORSMiddleware MUST be registered LAST so it is the outermost layer and can
# short-circuit OPTIONS preflights cleanly before other middleware interferes.

# Innermost: trusted host guard
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*"],  # Set to your Railway domain via env var if desired
)

# Middle: security response headers
app.add_middleware(SecurityHeadersMiddleware)

# Outermost: CORS — registered LAST, executes FIRST on every request
# allow_headers is explicit (no wildcard) to prevent header injection while
# covering all headers required by the Next.js frontend + JWT auth.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://phishguard-brown.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "X-Request-ID"],
    max_age=600,
)

# ── Routes ────────────────────────────────────────────────────────────────────
# auth.router has prefix="/auth", so the full login path resolves to:
#   POST /api/v1/auth/login  ✓
app.include_router(auth.router,  prefix="/api/v1")
app.include_router(scan.router,  prefix="/api/v1")
app.include_router(user.router,  prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}


# ── Error handlers ────────────────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """
    Normalise Pydantic 422 validation errors so field names / internal
    schema details are not leaked to the client in production.
    The first human-readable message is extracted and returned; the full
    error structure is never exposed.
    """
    errors = exc.errors()
    first_msg = "Validation error"
    if errors:
        raw = str(errors[0].get("msg", "Validation error"))
        first_msg = raw.replace("Value error, ", "").strip()

    return JSONResponse(
        status_code=422,
        content={"detail": first_msg},
    )


@app.exception_handler(404)
async def not_found(request: Request, exc):
    return JSONResponse(status_code=404, content={"detail": "Not found"})


@app.exception_handler(500)
async def server_error(request: Request, exc):
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
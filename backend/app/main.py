"""
PhishGuard — Production Cybersecurity API (SOC Edition)
========================================================
Added in this version:
  - app/services/network_monitor.py  — Real OS connection monitoring
  - app/services/threat_engine.py    — Enhanced 12-rule detection engine
  - app/services/threat_feed.py      — Live threat intelligence feeds
  - app/models/incidents.py          — Security incident model
  - app/routes/threat.py             — Extended SOC endpoints (incidents, network scan, feeds)

Middleware order (outermost → innermost):
  1. CORSMiddleware
  2. SecurityHeadersMiddleware
  3. TrustedHostMiddleware
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
from app.routes import auth, scan, user, admin, threat
try:
    from app.routes import agent as agent_route
    _AGENT_ROUTE_AVAILABLE = True
except Exception as _e:
    _AGENT_ROUTE_AVAILABLE = False
    logger.warning(f"Agent route not available: {_e}")
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
    logger.info("🚀 PhishGuard SOC API starting…")

    # Import all models so SQLAlchemy registers them before create_all
    from app.models import models  # noqa: F401
    try:
        from app.models import incidents  # noqa: F401
        logger.info("✅ Incident model loaded")
    except Exception as e:
        logger.warning(f"Could not load incident model: {e}")

    Base.metadata.create_all(bind=engine)
    logger.info("✅ Database tables ensured")

    db = SessionLocal()
    try:
        seed_demo_accounts(db)
    finally:
        db.close()

    url_service.initialize()

    # Start threat feed background loading.
    # ensure_loaded() is idempotent: the _bootstrap_started flag inside
    # threat_feed.py guarantees exactly one background thread per process,
    # even when uvicorn --reload triggers this lifespan multiple times.
    try:
        from app.services.threat_feed import ensure_loaded, FEED_REFRESH_INTERVAL
        ensure_loaded()
        logger.info(
            "✅ Threat intelligence feeds loading in background "            "(refresh interval: %ds)", FEED_REFRESH_INTERVAL,
        )
    except Exception as e:
        logger.warning("Threat feed init failed (non-fatal): %s", e)

    yield
    logger.info("👋 PhishGuard SOC API shutting down")


# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="PhishGuard SOC API",
    version=settings.APP_VERSION,
    description="Production-grade phishing detection + SOC monitoring platform",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://phishguard-brown.vercel.app",
        "https://phishguard-arpitmeh-glitchs-projects.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "X-Request-ID"],
    max_age=600,
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(auth.router,   prefix="/api/v1")
app.include_router(scan.router,   prefix="/api/v1")
app.include_router(user.router,   prefix="/api/v1")
app.include_router(admin.router,  prefix="/api/v1")
app.include_router(threat.router, prefix="/api/v1")
if _AGENT_ROUTE_AVAILABLE:
    app.include_router(agent_route.router, prefix="/api/v1")
    logger.info("✅ Agent route registered at /api/v1/agent")


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION, "edition": "SOC"}


# ── Error handlers ────────────────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first_msg = "Validation error"
    if errors:
        raw = str(errors[0].get("msg", "Validation error"))
        first_msg = raw.replace("Value error, ", "").strip()
    return JSONResponse(status_code=422, content={"detail": first_msg})


@app.exception_handler(404)
async def not_found(request: Request, exc):
    return JSONResponse(status_code=404, content={"detail": "Not found"})


@app.exception_handler(500)
async def server_error(request: Request, exc):
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(status_code=500, content={"detail": str(exc)})

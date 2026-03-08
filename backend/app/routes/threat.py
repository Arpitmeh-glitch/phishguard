"""
Live Threat Detection Routes
==============================
Provides endpoints for network threat monitoring.
"""

import logging
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User
from app.security.auth import require_user
from app.services.threat_service import analyze_domain, generate_demo_events

from slowapi import Limiter

def _user_id_key(request: Request) -> str:
    user: User = getattr(request.state, "rate_limit_user", None)
    if user is not None:
        return f"user:{user.id}"
    return request.client.host or "unknown"

threat_limiter = Limiter(key_func=_user_id_key)
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/threat", tags=["Threat Detection"])


def _inject_user(request: Request, current_user: User = Depends(require_user)) -> User:
    request.state.rate_limit_user = current_user
    return current_user


@router.get("/live")
@threat_limiter.limit("30/minute")
async def live_threats(
    request: Request,
    count: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(_inject_user),
):
    """
    Returns simulated live network threat detection events.
    In production this would read from real packet capture / DNS logs.
    """
    events = generate_demo_events(count)
    stats = {
        "total": len(events),
        "safe": sum(1 for e in events if e["risk_level"] == "safe"),
        "suspicious": sum(1 for e in events if e["risk_level"] == "suspicious"),
        "dangerous": sum(1 for e in events if e["risk_level"] == "dangerous"),
    }
    return {"events": events, "stats": stats}


@router.post("/analyze")
@threat_limiter.limit("20/minute")
async def analyze_single_domain(
    request: Request,
    payload: dict,
    current_user: User = Depends(_inject_user),
):
    """Analyze a specific domain for threat indicators."""
    domain = payload.get("domain", "").strip()
    port = payload.get("port")
    if not domain:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="domain is required")
    result = analyze_domain(domain, port)
    return result

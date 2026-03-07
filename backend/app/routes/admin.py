from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from app.database import get_db
from app.models.models import User, Scan, AuditLog, UserRole
from app.schemas.schemas import AdminStats, AdminUserList, UserOut, RoleUpdate
from app.security.auth import require_admin

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/stats", response_model=AdminStats)
def get_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Platform-wide statistics for the admin dashboard."""
    today = datetime.utcnow().date()
    today_start = datetime.combine(today, datetime.min.time())

    total_users = db.query(func.count(User.id)).scalar()
    total_scans = db.query(func.count(Scan.id)).scalar()
    scans_today = db.query(func.count(Scan.id)).filter(Scan.created_at >= today_start).scalar()
    phishing_detected = db.query(func.count(Scan.id)).filter(Scan.label == "PHISHING").scalar()
    fraud_detected = db.query(func.count(Scan.id)).filter(Scan.label == "FRAUD").scalar()
    safe_scans = db.query(func.count(Scan.id)).filter(Scan.label == "SAFE").scalar()
    url_scans = db.query(func.count(Scan.id)).filter(Scan.scan_type == "url").scalar()
    message_scans = db.query(func.count(Scan.id)).filter(Scan.scan_type == "message").scalar()
    file_scans = db.query(func.count(Scan.id)).filter(Scan.scan_type == "file").scalar()

    return AdminStats(
        total_users=total_users,
        total_scans=total_scans,
        scans_today=scans_today,
        phishing_detected=phishing_detected,
        fraud_detected=fraud_detected,
        safe_scans=safe_scans,
        url_scans=url_scans,
        message_scans=message_scans,
        file_scans=file_scans,
    )


@router.get("/users", response_model=AdminUserList)
def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    total = db.query(func.count(User.id)).scalar()
    users = (
        db.query(User)
        .order_by(desc(User.created_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return AdminUserList(items=users, total=total)


@router.patch("/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: str,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = UserRole(payload.role)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/toggle")
def toggle_user_active(
    user_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.commit()
    return {"is_active": user.is_active}


@router.get("/logs")
def get_audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    total = db.query(func.count(AuditLog.id)).scalar()
    logs = (
        db.query(AuditLog)
        .order_by(desc(AuditLog.created_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return {
        "items": [
            {
                "id": str(log.id),
                "user_id": str(log.user_id) if log.user_id else None,
                "action": log.action,
                "resource": log.resource,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/scans")
def get_all_scans(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    label: str = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = db.query(Scan)
    if label:
        query = query.filter(Scan.label == label.upper())
    
    total = query.count()
    scans = query.order_by(desc(Scan.created_at)).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "items": [
            {
                "id": str(s.id),
                "user_id": str(s.user_id),
                "scan_type": s.scan_type,
                "input_data": s.input_data[:200],
                "label": s.label,
                "confidence": s.confidence,
                "created_at": s.created_at.isoformat(),
            }
            for s in scans
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }

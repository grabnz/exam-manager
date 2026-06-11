"""Admin-only user management. Accounts are provisioned by the school
director (admin) — there is no public sign-up."""
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import UserCreate, UserUpdate, ResetPasswordBody
from ..auth import hash_password, require_admin

router = APIRouter(prefix="/api/users", tags=["users"])

USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,30}$")


def _user_row(u: User, class_count: int) -> dict:
    return {
        "id":                   u.id,
        "username":             u.username,
        "full_name":            u.full_name,
        "grade":                u.grade,
        "role":                 u.role,
        "is_active":            u.is_active,
        "must_change_password": u.must_change_password,
        "class_count":          class_count,
    }


@router.get("")
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at).all()
    return [_user_row(u, len(u.classes)) for u in users]


@router.post("")
def create_user(body: UserCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    username = body.username.strip().lower()
    if not USERNAME_RE.match(username):
        raise HTTPException(400, "اسم المستخدم: 3-30 حرفاً لاتينياً صغيراً أو أرقاماً (. _ - مسموحة)")
    if len(body.password) < 6:
        raise HTTPException(400, "كلمة المرور يجب أن تتكون من 6 أحرف على الأقل")
    if body.role not in ("teacher", "admin"):
        raise HTTPException(400, "Invalid role")
    if db.query(User).filter_by(username=username).first():
        raise HTTPException(409, "اسم المستخدم موجود مسبقاً")
    user = User(
        username=username,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
        grade=body.grade.strip(),
        role=body.role,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    return _user_row(user, 0)


@router.patch("/{user_id}")
def update_user(user_id: str, body: UserUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(404)
    if body.is_active is False and user.id == admin.id:
        raise HTTPException(400, "لا يمكن تعطيل حسابكم الخاص")
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.grade is not None:
        user.grade = body.grade.strip()
    if body.is_active is not None:
        user.is_active = body.is_active
    db.commit()
    return _user_row(user, len(user.classes))


@router.post("/{user_id}/reset-password")
def reset_password(user_id: str, body: ResetPasswordBody, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(404)
    if len(body.password) < 6:
        raise HTTPException(400, "كلمة المرور يجب أن تتكون من 6 أحرف على الأقل")
    user.password_hash = hash_password(body.password)
    user.must_change_password = True
    db.commit()
    return {"ok": True}


@router.delete("/{user_id}")
def delete_user(user_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(404)
    if user.id == admin.id:
        raise HTTPException(400, "لا يمكن حذف حسابكم الخاص")
    if user.classes:
        raise HTTPException(400, "هذا المستخدم له أقسام. أعيدوا إسنادها أولاً.")
    db.delete(user)
    db.commit()
    return {"ok": True}

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginBody, ChangePasswordBody
from ..auth import (
    hash_password, verify_password, create_token, get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_out(u: User) -> dict:
    return {
        "id":                   u.id,
        "username":             u.username,
        "full_name":            u.full_name,
        "grade":                u.grade,
        "role":                 u.role,
        "must_change_password": u.must_change_password,
    }


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(username=body.username.strip().lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "اسم المستخدم أو كلمة المرور غير صحيحة")
    if not user.is_active:
        raise HTTPException(403, "هذا الحساب معطَّل. اتصلوا بالإدارة.")
    return {"token": create_token(user), "user": _user_out(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.post("/change-password")
def change_password(
    body: ChangePasswordBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "كلمة المرور الحالية غير صحيحة")
    if len(body.new_password) < 6:
        raise HTTPException(400, "كلمة المرور الجديدة يجب أن تتكون من 6 أحرف على الأقل")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    db.commit()
    return {"ok": True, "user": _user_out(user)}

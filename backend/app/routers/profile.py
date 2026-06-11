from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User
from ..schemas import ProfileUpdate
from ..auth import get_current_user

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("")
def get_profile(user: User = Depends(get_current_user)):
    return {
        "name":    user.full_name or "",
        "grade":   user.grade or "",
        "subject": user.subject or "",
    }


@router.put("")
def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.full_name = body.name
    user.grade = body.grade
    user.subject = body.subject
    db.commit()
    return {"name": user.full_name, "grade": user.grade, "subject": user.subject}

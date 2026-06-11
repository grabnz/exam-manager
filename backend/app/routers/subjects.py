from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Subject, User
from ..auth import get_current_user

router = APIRouter(prefix="/api/subjects", tags=["subjects"])


def subject_out(s: Subject) -> dict:
    return {
        "id":          s.id,
        "code":        s.code,
        "name_ar":     s.name_ar,
        "name_fr":     s.name_fr,
        "order_index": s.order_index,
        "is_active":   s.is_active,
    }


@router.get("")
def list_subjects(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subjects = (
        db.query(Subject)
        .filter_by(is_active=True)
        .order_by(Subject.order_index)
        .all()
    )
    return [subject_out(s) for s in subjects]

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import TeacherProfile
from ..schemas import ProfileUpdate

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("")
def get_profile(db: Session = Depends(get_db)):
    p = db.query(TeacherProfile).first()
    return {"name": p.name if p else "", "grade": p.grade if p else ""}


@router.put("")
def update_profile(body: ProfileUpdate, db: Session = Depends(get_db)):
    p = db.query(TeacherProfile).first()
    if not p:
        p = TeacherProfile(id=1, name=body.name, grade=body.grade)
        db.add(p)
    else:
        p.name  = body.name
        p.grade = body.grade
    db.commit()
    return {"name": p.name, "grade": p.grade}

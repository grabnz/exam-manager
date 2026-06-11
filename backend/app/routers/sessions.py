from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import ExamSession, User
from ..schemas import SessionCreate, FinalizeBody
from ..auth import get_current_user
from .classes import get_visible_class

router = APIRouter(prefix="/api", tags=["sessions"])


def get_visible_session(db: Session, user: User, session_id: str) -> ExamSession:
    s = db.query(ExamSession).filter_by(id=session_id).first()
    if not s or (user.role != "admin" and s.class_.owner_id != user.id):
        raise HTTPException(404, "Session not found")
    return s


@router.get("/sessions/{session_id}")
def get_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_visible_session(db, user, session_id)
    return {
        "id":           s.id,
        "trimester":    s.trimester,
        "exam_type":    s.exam_type,
        "is_finalized": s.is_finalized,
        "class_id":     s.class_id,
        "class_name":   s.class_.name,
        "school_year":  s.class_.school_year.label,
        "teacher":      s.class_.teacher,
    }


@router.post("/classes/{class_id}/sessions")
def create_session(class_id: str, body: SessionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_visible_class(db, user, class_id)
    existing = db.query(ExamSession).filter_by(
        class_id=class_id, trimester=body.trimester, exam_type=body.exam_type
    ).first()
    if existing:
        return {"id": existing.id}
    sess = ExamSession(class_id=class_id, trimester=body.trimester, exam_type=body.exam_type)
    db.add(sess)
    db.commit()
    return {"id": sess.id}


@router.patch("/sessions/{session_id}/finalize")
def finalize_session(session_id: str, body: FinalizeBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_visible_session(db, user, session_id)
    s.is_finalized = body.finalized
    db.commit()
    return {"ok": True, "is_finalized": s.is_finalized}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_visible_session(db, user, session_id)
    if s.is_finalized:
        raise HTTPException(400, "Cannot delete a finalized session. Unlock it first.")
    db.delete(s)
    db.commit()
    return {"ok": True}

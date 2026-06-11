from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import ExamSession, User, Subject, GridTemplate, TeacherAssignment
from ..schemas import SessionCreate, FinalizeBody
from ..auth import get_current_user
from .classes import get_visible_class

router = APIRouter(prefix="/api", tags=["sessions"])


def get_accessible_session(db: Session, user: User, session_id: str) -> ExamSession:
    """Director: any session. Teacher: sessions of (class, subject) they are
    assigned to."""
    s = db.query(ExamSession).filter_by(id=session_id).first()
    if not s:
        raise HTTPException(404, "Session not found")
    if user.role == "admin":
        return s
    assigned = db.query(TeacherAssignment).filter_by(
        teacher_id=user.id, class_id=s.class_id, subject_id=s.subject_id
    ).first()
    if not assigned:
        raise HTTPException(404, "Session not found")
    return s


def _session_teacher_name(db: Session, s: ExamSession) -> str | None:
    a = db.query(TeacherAssignment).filter_by(
        class_id=s.class_id, subject_id=s.subject_id
    ).first()
    if a:
        return a.teacher.full_name or a.teacher.username
    return s.class_.teacher  # legacy free-text fallback


@router.get("/sessions/{session_id}")
def get_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_accessible_session(db, user, session_id)
    return {
        "id":           s.id,
        "trimester":    s.trimester,
        "exam_type":    s.exam_type,
        "is_finalized": s.is_finalized,
        "class_id":     s.class_id,
        "class_name":   s.class_.name,
        "school_year":  s.class_.school_year.label,
        "subject_id":   s.subject_id,
        "subject_name": s.subject.name_ar if s.subject else None,
        "template_id":  s.template_id,
        "teacher":      _session_teacher_name(db, s),
        "is_admin":     user.role == "admin",
    }


@router.post("/classes/{class_id}/sessions")
def create_session(class_id: str, body: SessionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_visible_class(db, user, class_id)

    # Resolve subject: explicit, or fall back to français (legacy clients)
    if body.subject_id:
        subject = db.query(Subject).filter_by(id=body.subject_id).first()
    else:
        subject = db.query(Subject).filter_by(code="francais").first()
    if not subject:
        raise HTTPException(404, "Subject not found")

    # Teacher must be assigned to this (class, subject)
    if user.role != "admin":
        assigned = db.query(TeacherAssignment).filter_by(
            teacher_id=user.id, class_id=class_id, subject_id=subject.id
        ).first()
        if not assigned:
            raise HTTPException(403, "لستم مسندين لهذه المادة في هذا القسم")

    existing = db.query(ExamSession).filter_by(
        class_id=class_id, subject_id=subject.id,
        trimester=body.trimester, exam_type=body.exam_type,
    ).first()
    if existing:
        return {"id": existing.id}

    # The school's customized grid (newest custom) wins over the built-in
    template = (
        db.query(GridTemplate)
        .filter_by(subject_id=subject.id, is_active=True)
        .order_by(GridTemplate.is_builtin.asc(), GridTemplate.created_at.desc())
        .first()
    )
    if not template:
        raise HTTPException(400, "لا توجد شبكة تقييم لهذه المادة بعد")

    sess = ExamSession(
        class_id=class_id, subject_id=subject.id, template_id=template.id,
        trimester=body.trimester, exam_type=body.exam_type,
    )
    db.add(sess)
    db.commit()
    return {"id": sess.id}


@router.patch("/sessions/{session_id}/finalize")
def finalize_session(session_id: str, body: FinalizeBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_accessible_session(db, user, session_id)
    if not body.finalized and user.role != "admin":
        raise HTTPException(403, "فقط المدير يمكنه إلغاء قفل جلسة نهائية")
    s.is_finalized = body.finalized
    db.commit()
    return {"ok": True, "is_finalized": s.is_finalized}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_accessible_session(db, user, session_id)
    if s.is_finalized:
        raise HTTPException(400, "لا يمكن حذف جلسة مقفلة. اطلبوا من المدير إلغاء القفل أولاً.")
    db.delete(s)
    db.commit()
    return {"ok": True}

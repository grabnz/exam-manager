"""Teacher↔class↔subject assignments — the source of truth for what a
teacher can see and edit. Managed by the director."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import TeacherAssignment, User, Class, Subject
from ..schemas import AssignmentCreate
from ..auth import get_current_user, require_admin

router = APIRouter(prefix="/api/assignments", tags=["assignments"])


def _assignment_out(a: TeacherAssignment) -> dict:
    return {
        "id":           a.id,
        "teacher_id":   a.teacher_id,
        "teacher_name": a.teacher.full_name or a.teacher.username,
        "class_id":     a.class_id,
        "class_name":   a.class_.name,
        "school_year":  a.class_.school_year.label,
        "subject_id":   a.subject_id,
        "subject_name": a.subject.name_ar,
    }


@router.get("")
def list_assignments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(TeacherAssignment)
    if user.role != "admin":
        q = q.filter_by(teacher_id=user.id)
    return [_assignment_out(a) for a in q.all()]


@router.post("")
def create_assignments(body: AssignmentCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    teacher = db.query(User).filter_by(id=body.teacher_id).first()
    if not teacher or teacher.role != "teacher":
        raise HTTPException(404, "المعلم غير موجود")
    if not db.query(Class).filter_by(id=body.class_id).first():
        raise HTTPException(404, "القسم غير موجود")

    created = []
    for subject_id in body.subject_ids:
        if not db.query(Subject).filter_by(id=subject_id).first():
            raise HTTPException(404, "المادة غير موجودة")
        exists = db.query(TeacherAssignment).filter_by(
            teacher_id=body.teacher_id, class_id=body.class_id, subject_id=subject_id
        ).first()
        if exists:
            continue
        a = TeacherAssignment(
            teacher_id=body.teacher_id, class_id=body.class_id, subject_id=subject_id
        )
        db.add(a)
        db.flush()
        created.append(a)
    db.commit()
    return [_assignment_out(a) for a in created]


@router.delete("/{assignment_id}")
def delete_assignment(assignment_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    a = db.query(TeacherAssignment).filter_by(id=assignment_id).first()
    if not a:
        raise HTTPException(404)
    # Sessions and scores stay — the data belongs to the school, not the teacher
    db.delete(a)
    db.commit()
    return {"ok": True}

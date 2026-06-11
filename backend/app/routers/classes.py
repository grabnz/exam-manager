from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (
    SchoolYear, Class, Student, ExamSession, User,
    Subject, GridTemplate, TeacherAssignment,
)
from ..schemas import ClassCreate, ClassUpdate, StudentCreate, StudentUpdate
from ..services.pdf_parser import parse_pdf
from ..auth import get_current_user, require_admin

router = APIRouter(prefix="/api/classes", tags=["classes"])
students_router = APIRouter(prefix="/api/students", tags=["students"])


def get_visible_class(db: Session, user: User, class_id: str) -> Class:
    """Director sees all classes; a teacher only classes they are assigned to."""
    c = db.query(Class).filter_by(id=class_id).first()
    if not c:
        raise HTTPException(404, "Class not found")
    if user.role == "admin":
        return c
    assigned = db.query(TeacherAssignment).filter_by(
        teacher_id=user.id, class_id=class_id
    ).first()
    if not assigned:
        raise HTTPException(404, "Class not found")
    return c


def _get_or_create_year(db: Session, label: str) -> SchoolYear:
    year = db.query(SchoolYear).filter_by(label=label).first()
    if not year:
        year = SchoolYear(label=label)
        db.add(year)
        db.flush()
    return year


def _trimester_status(sessions) -> dict:
    """Per-trimester progress for a list of sessions (one class+subject)."""
    status = {}
    for s in sessions:
        t = s.trimester
        if t not in status:
            status[t] = {"has_taqyim": False, "imtihan_finalized": False, "imtihan_exists": False}
        if s.exam_type == "امتحان":
            status[t]["imtihan_exists"] = True
            if s.is_finalized:
                status[t]["imtihan_finalized"] = True
        elif s.exam_type.startswith("تقييم"):
            status[t]["has_taqyim"] = True
    return status


# ── Class creation (director) ────────────────────────────────────────────────

@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    content = await file.read()
    result  = parse_pdf(content)

    students = result["students"]
    meta     = result["meta"]

    if not students:
        raise HTTPException(400, "No students found in this PDF.")

    school_year = _get_or_create_year(db, meta.get("school_year") or "Unknown")

    class_ = Class(
        school_year_id=school_year.id,
        name=meta.get("class_name") or "Unknown",
        teacher=meta.get("teacher"),
    )
    db.add(class_)
    db.flush()

    for i, name in enumerate(students):
        db.add(Student(class_id=class_.id, full_name=name, order_index=i))

    # The school-site PDF is the French exam sheet → auto-create the session
    session_id = None
    if meta.get("trimester") and meta.get("exam_type"):
        subject = db.query(Subject).filter_by(code="francais").first()
        template = (
            db.query(GridTemplate)
            .filter_by(subject_id=subject.id, is_builtin=True, is_active=True)
            .first()
        )
        sess = ExamSession(
            class_id=class_.id,
            subject_id=subject.id,
            template_id=template.id if template else None,
            trimester=meta["trimester"],
            exam_type=meta["exam_type"],
        )
        db.add(sess)
        db.flush()
        session_id = sess.id

    db.commit()
    return {
        "id":            class_.id,
        "name":          class_.name,
        "school_year":   school_year.label,
        "student_count": len(students),
        "session_id":    session_id,
    }


@router.post("")
def create_class(
    body: ClassCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    name = body.name.strip()
    year_label = body.school_year.strip()
    if not name or not year_label:
        raise HTTPException(400, "الاسم والسنة الدراسية مطلوبان")
    school_year = _get_or_create_year(db, year_label)
    class_ = Class(school_year_id=school_year.id, name=name,
                   level=(body.level or "").strip() or None)
    db.add(class_)
    db.commit()
    return {"id": class_.id, "name": class_.name, "school_year": school_year.label}


# ── Listing ──────────────────────────────────────────────────────────────────

@router.get("")
def list_classes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    is_admin = user.role == "admin"

    # teacher: subjects per class from assignments; director: all
    my_assignments = {}
    if not is_admin:
        for a in db.query(TeacherAssignment).filter_by(teacher_id=user.id).all():
            my_assignments.setdefault(a.class_id, []).append(a.subject)

    years = db.query(SchoolYear).order_by(SchoolYear.label.desc()).all()
    result = []
    for year in years:
        classes = []
        for c in year.classes:
            if not is_admin and c.id not in my_assignments:
                continue

            if is_admin:
                # all subjects with an assignment or an existing session
                subj_map = {a.subject.id: a.subject for a in c.assignments}
                for s in c.sessions:
                    if s.subject:
                        subj_map.setdefault(s.subject.id, s.subject)
                subjects = sorted(subj_map.values(), key=lambda s: s.order_index)
            else:
                subjects = sorted(my_assignments[c.id], key=lambda s: s.order_index)

            subject_items = []
            for subj in subjects:
                subj_sessions = [s for s in c.sessions if s.subject_id == subj.id]
                teachers = [a.teacher.full_name or a.teacher.username
                            for a in c.assignments if a.subject_id == subj.id]
                subject_items.append({
                    "subject_id":       subj.id,
                    "code":             subj.code,
                    "name":             subj.name_ar,
                    "session_count":    len(subj_sessions),
                    "trimester_status": _trimester_status(subj_sessions),
                    "teachers":         teachers,
                })

            classes.append({
                "id":            c.id,
                "name":          c.name,
                "level":         c.level,
                "teacher":       c.teacher,   # legacy free-text
                "student_count": len(c.students),
                "session_count": len(c.sessions),
                "subjects":      subject_items,
            })
        if classes:
            result.append({"label": year.label, "classes": classes})
    return result


@router.get("/{class_id}")
def get_class(class_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_visible_class(db, user, class_id)

    sessions = [
        {
            "id":           s.id,
            "subject_id":   s.subject_id,
            "trimester":    s.trimester,
            "exam_type":    s.exam_type,
            "has_scores":   len(s.scores) > 0 or len(s.entries) > 0,
            "is_finalized": s.is_finalized,
        }
        for s in c.sessions
    ]

    if user.role == "admin":
        my_subjects = sorted({a.subject for a in c.assignments}, key=lambda s: s.order_index)
    else:
        my_subjects = sorted(
            (a.subject for a in c.assignments if a.teacher_id == user.id),
            key=lambda s: s.order_index,
        )

    return {
        "id":          c.id,
        "name":        c.name,
        "level":       c.level,
        "teacher":     c.teacher,
        "school_year": c.school_year.label,
        "is_admin":    user.role == "admin",
        "my_subjects": [{"id": s.id, "code": s.code, "name": s.name_ar} for s in my_subjects],
        "assignments": [
            {
                "id":           a.id,
                "teacher_id":   a.teacher_id,
                "teacher_name": a.teacher.full_name or a.teacher.username,
                "subject_id":   a.subject_id,
                "subject_name": a.subject.name_ar,
            }
            for a in c.assignments
        ],
        "students": [
            {"id": s.id, "full_name": s.full_name, "order_index": s.order_index}
            for s in c.students
        ],
        "sessions": sessions,
    }


@router.patch("/{class_id}")
def update_class(
    class_id: str,
    body: ClassUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    c = db.query(Class).filter_by(id=class_id).first()
    if not c:
        raise HTTPException(404, "Class not found")
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "الاسم لا يمكن أن يكون فارغاً")
        c.name = name
    if body.level is not None:
        c.level = body.level.strip() or None
    db.commit()
    return {"ok": True, "name": c.name}


@router.delete("/{class_id}")
def delete_class(class_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.query(Class).filter_by(id=class_id).first()
    if not c:
        raise HTTPException(404, "Class not found")
    if any(s.is_finalized for s in c.sessions):
        raise HTTPException(400, "القسم يحتوي على امتحانات نهائية مقفلة. ألغوا القفل أولاً.")
    db.delete(c)
    db.commit()
    return {"ok": True}


# ── Students (director) ──────────────────────────────────────────────────────

@router.post("/{class_id}/students")
def add_student(
    class_id: str,
    body: StudentCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    c = db.query(Class).filter_by(id=class_id).first()
    if not c:
        raise HTTPException(404, "Class not found")
    name = body.full_name.strip()
    if not name:
        raise HTTPException(400, "اسم التلميذ مطلوب")
    next_index = max((s.order_index for s in c.students), default=-1) + 1
    student = Student(class_id=c.id, full_name=name, order_index=next_index)
    db.add(student)
    db.commit()
    return {"id": student.id, "full_name": student.full_name, "order_index": student.order_index}


@students_router.patch("/{student_id}")
def rename_student(
    student_id: str,
    body: StudentUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    s = db.query(Student).filter_by(id=student_id).first()
    if not s:
        raise HTTPException(404, "Student not found")
    name = body.full_name.strip()
    if not name:
        raise HTTPException(400, "اسم التلميذ مطلوب")
    s.full_name = name
    db.commit()
    return {"ok": True}


@students_router.delete("/{student_id}")
def delete_student(
    student_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    s = db.query(Student).filter_by(id=student_id).first()
    if not s:
        raise HTTPException(404, "Student not found")
    db.delete(s)
    db.commit()
    return {"ok": True}

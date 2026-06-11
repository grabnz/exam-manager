from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import SchoolYear, Class, Student, ExamSession, StudentScore, User
from ..schemas import ClassCreate, ClassUpdate, ClassOwnerUpdate, StudentCreate, StudentUpdate
from ..services.pdf_parser import parse_pdf
from ..auth import get_current_user, require_admin

router = APIRouter(prefix="/api/classes", tags=["classes"])
students_router = APIRouter(prefix="/api/students", tags=["students"])


def get_visible_class(db: Session, user: User, class_id: str) -> Class:
    """A teacher can only access their own classes; an admin can access all."""
    c = db.query(Class).filter_by(id=class_id).first()
    if not c or (user.role != "admin" and c.owner_id != user.id):
        raise HTTPException(404, "Class not found")
    return c


def _get_or_create_year(db: Session, label: str) -> SchoolYear:
    year = db.query(SchoolYear).filter_by(label=label).first()
    if not year:
        year = SchoolYear(label=label)
        db.add(year)
        db.flush()
    return year


@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
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
        owner_id=user.id,
        name=meta.get("class_name") or "Unknown",
        teacher=meta.get("teacher"),
    )
    db.add(class_)
    db.flush()

    for i, name in enumerate(students):
        db.add(Student(class_id=class_.id, full_name=name, order_index=i))

    # Auto-create exam session if PDF contains trimester + exam type
    session_id = None
    if meta.get("trimester") and meta.get("exam_type"):
        sess = ExamSession(
            class_id=class_.id,
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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = body.name.strip()
    year_label = body.school_year.strip()
    if not name or not year_label:
        raise HTTPException(400, "الاسم والسنة الدراسية مطلوبان")
    school_year = _get_or_create_year(db, year_label)
    class_ = Class(school_year_id=school_year.id, owner_id=user.id, name=name)
    db.add(class_)
    db.commit()
    return {"id": class_.id, "name": class_.name, "school_year": school_year.label}


@router.get("")
def list_classes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    years = db.query(SchoolYear).order_by(SchoolYear.label.desc()).all()
    result = []
    for year in years:
        classes = []
        for c in year.classes:
            if user.role != "admin" and c.owner_id != user.id:
                continue
            score_count = (
                db.query(StudentScore)
                .join(ExamSession, StudentScore.session_id == ExamSession.id)
                .filter(ExamSession.class_id == c.id)
                .count()
            )
            # Trimester progress: for each trimester, is the امتحان finalized?
            trimester_status = {}
            for s in c.sessions:
                t = s.trimester
                if t not in trimester_status:
                    trimester_status[t] = {"has_taqyim": False, "imtihan_finalized": False, "imtihan_exists": False}
                if s.exam_type == "امتحان":
                    trimester_status[t]["imtihan_exists"] = True
                    if s.is_finalized:
                        trimester_status[t]["imtihan_finalized"] = True
                elif s.exam_type.startswith("تقييم"):
                    trimester_status[t]["has_taqyim"] = True

            classes.append({
                "id":               c.id,
                "name":             c.name,
                "teacher":          c.teacher,
                "owner_id":         c.owner_id,
                "owner_name":       c.owner.full_name or c.owner.username if c.owner else None,
                "student_count":    len(c.students),
                "session_count":    len(c.sessions),
                "has_scores":       score_count > 0,
                "trimester_status": trimester_status,  # {1: {has_taqyim, imtihan_finalized, imtihan_exists}, ...}
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
            "trimester":    s.trimester,
            "exam_type":    s.exam_type,
            "has_scores":   len(s.scores) > 0,
            "is_finalized": s.is_finalized,
        }
        for s in c.sessions
    ]

    return {
        "id":          c.id,
        "name":        c.name,
        "teacher":     c.teacher,
        "school_year": c.school_year.label,
        "students":    [
            {"id": s.id, "full_name": s.full_name, "order_index": s.order_index}
            for s in c.students
        ],
        "sessions": sessions,
    }


@router.patch("/{class_id}")
def update_class(
    class_id: str,
    body: ClassUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = get_visible_class(db, user, class_id)
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "الاسم لا يمكن أن يكون فارغاً")
        c.name = name
    db.commit()
    return {"ok": True, "name": c.name}


@router.patch("/{class_id}/owner")
def assign_class_owner(
    class_id: str,
    body: ClassOwnerUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    c = db.query(Class).filter_by(id=class_id).first()
    if not c:
        raise HTTPException(404, "Class not found")
    if body.owner_id is not None:
        if not db.query(User).filter_by(id=body.owner_id).first():
            raise HTTPException(404, "User not found")
    c.owner_id = body.owner_id
    db.commit()
    return {"ok": True}


@router.delete("/{class_id}")
def delete_class(class_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_visible_class(db, user, class_id)
    if any(s.is_finalized for s in c.sessions):
        raise HTTPException(400, "القسم يحتوي على امتحانات نهائية مقفلة. ألغوا القفل أولاً.")
    db.delete(c)
    db.commit()
    return {"ok": True}


# ── Students ─────────────────────────────────────────────────────────────────

@router.post("/{class_id}/students")
def add_student(
    class_id: str,
    body: StudentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = get_visible_class(db, user, class_id)
    name = body.full_name.strip()
    if not name:
        raise HTTPException(400, "اسم التلميذ مطلوب")
    next_index = max((s.order_index for s in c.students), default=-1) + 1
    student = Student(class_id=c.id, full_name=name, order_index=next_index)
    db.add(student)
    db.commit()
    return {"id": student.id, "full_name": student.full_name, "order_index": student.order_index}


def _get_visible_student(db: Session, user: User, student_id: str) -> Student:
    s = db.query(Student).filter_by(id=student_id).first()
    if not s or (user.role != "admin" and s.class_.owner_id != user.id):
        raise HTTPException(404, "Student not found")
    return s


@students_router.patch("/{student_id}")
def rename_student(
    student_id: str,
    body: StudentUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = _get_visible_student(db, user, student_id)
    name = body.full_name.strip()
    if not name:
        raise HTTPException(400, "اسم التلميذ مطلوب")
    s.full_name = name
    db.commit()
    return {"ok": True}


@students_router.delete("/{student_id}")
def delete_student(
    student_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = _get_visible_student(db, user, student_id)
    db.delete(s)
    db.commit()
    return {"ok": True}

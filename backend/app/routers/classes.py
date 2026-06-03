from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import SchoolYear, Class, Student, ExamSession, StudentScore
from ..services.pdf_parser import parse_pdf

router = APIRouter(prefix="/api/classes", tags=["classes"])


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    result  = parse_pdf(content)

    students = result["students"]
    meta     = result["meta"]

    if not students:
        raise HTTPException(400, "No students found in this PDF.")

    # Get or create school year
    year_label  = meta.get("school_year") or "Unknown"
    school_year = db.query(SchoolYear).filter_by(label=year_label).first()
    if not school_year:
        school_year = SchoolYear(label=year_label)
        db.add(school_year)
        db.flush()

    # Create class
    class_ = Class(
        school_year_id=school_year.id,
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
        "school_year":   year_label,
        "student_count": len(students),
        "session_id":    session_id,
    }


@router.get("")
def list_classes(db: Session = Depends(get_db)):
    years = db.query(SchoolYear).order_by(SchoolYear.label.desc()).all()
    result = []
    for year in years:
        classes = []
        for c in year.classes:
            score_count = (
                db.query(StudentScore)
                .join(ExamSession, StudentScore.session_id == ExamSession.id)
                .filter(ExamSession.class_id == c.id)
                .count()
            )
            classes.append({
                "id":            c.id,
                "name":          c.name,
                "teacher":       c.teacher,
                "student_count": len(c.students),
                "session_count": len(c.sessions),
                "has_scores":    score_count > 0,
            })
        result.append({"label": year.label, "classes": classes})
    return result


@router.get("/{class_id}")
def get_class(class_id: str, db: Session = Depends(get_db)):
    c = db.query(Class).filter_by(id=class_id).first()
    if not c:
        raise HTTPException(404, "Class not found")

    sessions = [
        {
            "id":         s.id,
            "trimester":  s.trimester,
            "exam_type":  s.exam_type,
            "has_scores": len(s.scores) > 0,
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


@router.delete("/{class_id}")
def delete_class(class_id: str, db: Session = Depends(get_db)):
    c = db.query(Class).filter_by(id=class_id).first()
    if not c:
        raise HTTPException(404)
    db.delete(c)
    db.commit()
    return {"ok": True}

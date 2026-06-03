from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io

from ..database import get_db
from ..models import ExamSession, StudentScore
from ..schemas import ScoresSave, SCORE_FIELDS
from ..services.excel_export import export_session

router = APIRouter(prefix="/api/sessions", tags=["scores"])


@router.get("/{session_id}/scores")
def get_scores(session_id: str, db: Session = Depends(get_db)):
    s = db.query(ExamSession).filter_by(id=session_id).first()
    if not s:
        raise HTTPException(404)

    scores_map = {sc.student_id: sc for sc in s.scores}
    result = []
    for student in s.class_.students:
        sc  = scores_map.get(student.id)
        row = {
            "student_id":   student.id,
            "student_name": student.full_name,
            "order_index":  student.order_index,
        }
        for f in SCORE_FIELDS:
            row[f] = getattr(sc, f, None) if sc else None
        result.append(row)
    return result


@router.put("/{session_id}/scores")
def save_scores(session_id: str, body: ScoresSave, db: Session = Depends(get_db)):
    if not db.query(ExamSession).filter_by(id=session_id).first():
        raise HTTPException(404)

    for item in body.scores:
        sc = db.query(StudentScore).filter_by(
            session_id=session_id, student_id=item.student_id
        ).first()
        if not sc:
            sc = StudentScore(session_id=session_id, student_id=item.student_id)
            db.add(sc)
        for f in SCORE_FIELDS:
            setattr(sc, f, getattr(item, f))

    db.commit()
    return {"ok": True}


@router.get("/{session_id}/export")
def export_excel(session_id: str, db: Session = Depends(get_db)):
    s = db.query(ExamSession).filter_by(id=session_id).first()
    if not s:
        raise HTTPException(404)

    xlsx_bytes = export_session(s)
    filename   = f"{s.class_.name}_T{s.trimester}_{s.exam_type}.xlsx"

    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

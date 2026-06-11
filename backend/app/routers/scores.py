from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
import traceback, urllib.parse

from ..database import get_db
from ..models import StudentScore, User
from ..schemas import ScoresSave, SCORE_FIELDS
from ..services.excel_export import export_session
from ..auth import get_current_user
from .sessions import get_accessible_session

router = APIRouter(prefix="/api/sessions", tags=["scores"])


@router.get("/{session_id}/scores")
def get_scores(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_accessible_session(db, user, session_id)

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
def save_scores(session_id: str, body: ScoresSave, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_accessible_session(db, user, session_id)
    if s.is_finalized:
        raise HTTPException(400, "هذه الجلسة مقفلة. ألغوا القفل لتعديل الأعداد.")

    valid_student_ids = {st.id for st in s.class_.students}
    for item in body.scores:
        if item.student_id not in valid_student_ids:
            continue
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
def export_excel(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        s = get_accessible_session(db, user, session_id)

        xlsx_bytes = export_session(s)

        # RFC 5987 encoded filename — safe for all HTTP clients
        safe_name = urllib.parse.quote(f"{s.class_.name}_T{s.trimester}.xlsx")
        content_disposition = f"attachment; filename=\"scores.xlsx\"; filename*=UTF-8''{safe_name}"

        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": content_disposition},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=f"{e}\n{traceback.format_exc()}")

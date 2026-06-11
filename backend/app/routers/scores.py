from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, JSONResponse
from sqlalchemy.orm import Session
import traceback, urllib.parse

from ..database import get_db
from ..models import ScoreEntry, User
from ..schemas import ScoresSaveV2
from ..services.excel_export import export_session
from ..services import grid
from ..auth import get_current_user
from .sessions import get_accessible_session

router = APIRouter(prefix="/api/sessions", tags=["scores"])


def _rows_payload(s) -> list:
    """Generic score rows for a session."""
    entries = {e.student_id: e for e in s.entries}
    rows = []
    for student in s.class_.students:
        e = entries.get(student.id)
        values = e.values if e else {}
        rows.append({
            "student_id":   student.id,
            "student_name": student.full_name,
            "order_index":  student.order_index,
            "criteria":     values.get("criteria") or {},
            "sections":     values.get("sections") or {},
            "final_score":  e.final_score if e else None,
            "updated_at":   e.updated_at.isoformat() if e and e.updated_at else None,
        })
    return rows


@router.get("/{session_id}/scores")
def get_scores(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_accessible_session(db, user, session_id)
    return _rows_payload(s)


@router.put("/{session_id}/scores")
def save_scores(session_id: str, body: ScoresSaveV2, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = get_accessible_session(db, user, session_id)
    if s.is_finalized:
        raise HTTPException(400, "هذه الجلسة مقفلة. اطلبوا من المدير إلغاء القفل لتعديل الأعداد.")
    template = s.template
    if not template:
        raise HTTPException(400, "لا شبكة تقييم مرتبطة بهذه الجلسة")

    # Offline-sync conflict detection: someone saved after the client's snapshot
    if body.base_updated_at and not body.force:
        latest = max((e.updated_at for e in s.entries if e.updated_at), default=None)
        base = body.base_updated_at.replace(tzinfo=None)
        if latest and latest > base:
            return JSONResponse(
                status_code=409,
                content={
                    "detail": "تم تعديل الأعداد من جهاز آخر بعد آخر مزامنة",
                    "server_rows": _rows_payload(s),
                },
            )

    # Valid ids for this session's pinned template
    valid_criteria = {c.id for sec in template.sections for c in sec.criteria}
    valid_sections = {sec.id for sec in template.sections}
    valid_students = {st.id for st in s.class_.students}
    entries = {e.student_id: e for e in s.entries}

    now = datetime.utcnow()
    for item in body.scores:
        if item.student_id not in valid_students:
            continue
        values = {
            "criteria": {k: v for k, v in item.criteria.items() if k in valid_criteria},
            "sections": {
                k: {"bonus": v.bonus, "st": v.st}
                for k, v in item.sections.items() if k in valid_sections
            },
        }
        entry = entries.get(item.student_id)
        if not entry:
            entry = ScoreEntry(session_id=session_id, student_id=item.student_id)
            db.add(entry)
        entry.values = values
        entry.final_score = grid.final_score(template, values)
        entry.updated_at = now
        entry.updated_by = user.id

    db.commit()
    return {"ok": True, "saved_at": now.isoformat()}


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

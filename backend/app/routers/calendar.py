"""Agenda (روزنامة): each user manages their own events; the director can
publish school-wide events visible to everyone."""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models import CalendarEvent, User
from ..auth import get_current_user

router = APIRouter(prefix="/api/events", tags=["calendar"])

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
COLORS = {"blue", "green", "amber", "rose", "purple"}


class EventCreate(BaseModel):
    title: str
    date:  str                      # YYYY-MM-DD
    time:  Optional[str] = None     # HH:MM
    note:  str = ""
    color: str = "blue"
    is_school_wide: bool = False


def _out(e: CalendarEvent) -> dict:
    return {
        "id":             e.id,
        "title":          e.title,
        "date":           e.date,
        "time":           e.time,
        "note":           e.note,
        "color":          e.color,
        "is_school_wide": e.is_school_wide,
        "is_mine":        True,   # overwritten by caller
        "by":             (e.user.full_name or e.user.username) if e.user else None,
    }


@router.get("")
def list_events(
    start: str, end: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not DATE_RE.match(start) or not DATE_RE.match(end):
        raise HTTPException(400, "Invalid date range")
    events = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.date >= start, CalendarEvent.date <= end)
        .filter(or_(CalendarEvent.user_id == user.id, CalendarEvent.is_school_wide.is_(True)))
        .order_by(CalendarEvent.date, CalendarEvent.time)
        .all()
    )
    out = []
    for e in events:
        item = _out(e)
        item["is_mine"] = e.user_id == user.id
        out.append(item)
    return out


@router.post("")
def create_event(body: EventCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not body.title.strip():
        raise HTTPException(400, "العنوان مطلوب")
    if not DATE_RE.match(body.date):
        raise HTTPException(400, "تاريخ غير صالح")
    if body.time and not TIME_RE.match(body.time):
        raise HTTPException(400, "توقيت غير صالح")
    if body.is_school_wide and user.role != "admin":
        raise HTTPException(403, "فقط المدير يمكنه نشر أحداث للمدرسة كلها")
    e = CalendarEvent(
        user_id=user.id,
        title=body.title.strip(),
        date=body.date,
        time=body.time,
        note=body.note.strip(),
        color=body.color if body.color in COLORS else "blue",
        is_school_wide=body.is_school_wide,
    )
    db.add(e)
    db.commit()
    item = _out(e)
    item["is_mine"] = True
    return item


@router.delete("/{event_id}")
def delete_event(event_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    e = db.query(CalendarEvent).filter_by(id=event_id).first()
    if not e:
        raise HTTPException(404)
    if e.user_id != user.id and user.role != "admin":
        raise HTTPException(403)
    db.delete(e)
    db.commit()
    return {"ok": True}

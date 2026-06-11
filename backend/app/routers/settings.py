from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SchoolSettings, User
from ..schemas import SettingsUpdate
from ..auth import get_current_user, require_admin

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _out(s: SchoolSettings | None) -> dict:
    return {
        "school_name": s.school_name if s else "",
        "active_year": s.active_year if s else "",
        "region":      s.region if s else "",
    }


@router.get("")
def get_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _out(db.get(SchoolSettings, 1))


@router.put("")
def update_settings(body: SettingsUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(SchoolSettings, 1)
    if not s:
        s = SchoolSettings(id=1)
        db.add(s)
    s.school_name = body.school_name.strip()
    s.active_year = body.active_year.strip()
    s.region = body.region.strip()
    db.commit()
    return _out(s)

"""Dashboard statistics — role-aware.

Director: school KPIs, alerts, per-subject averages, recent activity.
Teacher: per-assignment cards with progress and averages.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    User, Class, Student, ExamSession, ScoreEntry, TeacherAssignment, Subject,
)
from ..auth import get_current_user

router = APIRouter(prefix="/api/stats", tags=["stats"])

IMTIHAN = "امتحان"


def _avg(values) -> float | None:
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def _pair_stats(db: Session, c: Class, subject: Subject) -> dict:
    """Progress + average for one (class × subject)."""
    sessions = [s for s in c.sessions if s.subject_id == subject.id]
    trimester_status = {}
    for s in sessions:
        t = s.trimester
        st = trimester_status.setdefault(
            t, {"has_taqyim": False, "imtihan_finalized": False, "imtihan_exists": False})
        if s.exam_type == IMTIHAN:
            st["imtihan_exists"] = True
            if s.is_finalized:
                st["imtihan_finalized"] = True
        elif s.exam_type.startswith("تقييم"):
            st["has_taqyim"] = True

    finalized_trims = sum(1 for st in trimester_status.values() if st["imtihan_finalized"])

    # Average: latest امتحان with entries, else latest session with entries
    avg_final = None
    candidates = sorted(sessions, key=lambda s: (s.exam_type != IMTIHAN, -s.trimester))
    for s in candidates:
        if s.entries:
            avg_final = _avg(e.final_score for e in s.entries)
            if avg_final is not None:
                break

    last_session = None
    with_entries = [s for s in sessions if s.entries]
    if with_entries:
        latest = max(with_entries,
                     key=lambda s: max((e.updated_at for e in s.entries if e.updated_at),
                                       default=s.created_at))
        last_session = {"id": latest.id, "trimester": latest.trimester, "exam_type": latest.exam_type}
    elif sessions:
        latest = max(sessions, key=lambda s: s.created_at or 0)
        last_session = {"id": latest.id, "trimester": latest.trimester, "exam_type": latest.exam_type}

    return {
        "class_id":         c.id,
        "class_name":       c.name,
        "level":            c.level,
        "school_year":      c.school_year.label,
        "subject_id":       subject.id,
        "subject_code":     subject.code,
        "subject_name":     subject.name_ar,
        "student_count":    len(c.students),
        "session_count":    len(sessions),
        "trimester_status": trimester_status,
        "finalized_trimesters": finalized_trims,
        "avg_final":        avg_final,
        "last_session":     last_session,
    }


@router.get("")
def get_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "admin":
        return _director_stats(db)
    return _teacher_stats(db, user)


def _teacher_stats(db: Session, user: User) -> dict:
    assignments = db.query(TeacherAssignment).filter_by(teacher_id=user.id).all()
    cards = [_pair_stats(db, a.class_, a.subject) for a in assignments]
    cards.sort(key=lambda x: (x["class_name"], x["subject_name"]))

    total_pairs = len(cards)
    finalized = sum(c["finalized_trimesters"] for c in cards)
    return {
        "role": "teacher",
        "totals": {
            "classes":        len({c["class_id"] for c in cards}),
            "subjects":       len({c["subject_id"] for c in cards}),
            "students":       sum(c["student_count"] for c in {c["class_id"]: c for c in cards}.values()),
            "completion_pct": round(100 * finalized / (3 * total_pairs)) if total_pairs else 0,
        },
        "cards": cards,
    }


def _director_stats(db: Session) -> dict:
    classes = db.query(Class).all()
    teachers = db.query(User).filter_by(role="teacher", is_active=True).count()
    students = db.query(Student).count()
    sessions = db.query(ExamSession).count()

    # (class × subject) pairs from assignments ∪ sessions
    pair_keys = set()
    pairs = []
    for c in classes:
        subj_map = {}
        for a in c.assignments:
            subj_map[a.subject_id] = a.subject
        for s in c.sessions:
            if s.subject and s.subject_id not in subj_map:
                subj_map[s.subject_id] = s.subject
        for subj in subj_map.values():
            if (c.id, subj.id) not in pair_keys:
                pair_keys.add((c.id, subj.id))
                pairs.append(_pair_stats(db, c, subj))

    finalized = sum(p["finalized_trimesters"] for p in pairs)
    completion = round(100 * finalized / (3 * len(pairs))) if pairs else 0

    # Alerts
    unassigned_classes = [
        {"id": c.id, "name": c.name}
        for c in classes if not c.assignments
    ]

    # School-wide averages per subject (from final scores of finalized امتحان)
    subject_avgs = {}
    for p in pairs:
        if p["avg_final"] is not None:
            subject_avgs.setdefault(p["subject_name"], []).append(p["avg_final"])
    subject_averages = [
        {"subject_name": name, "avg": _avg(vals)}
        for name, vals in subject_avgs.items()
    ]
    subject_averages.sort(key=lambda x: -(x["avg"] or 0))

    # Recent activity: latest score saves (one line per session)
    entries = (
        db.query(ScoreEntry)
        .filter(ScoreEntry.updated_at.isnot(None))
        .order_by(ScoreEntry.updated_at.desc())
        .limit(60)
        .all()
    )
    seen_sessions = set()
    activity = []
    for e in entries:
        if e.session_id in seen_sessions:
            continue
        seen_sessions.add(e.session_id)
        s = e.session
        editor = db.get(User, e.updated_by) if e.updated_by else None
        activity.append({
            "session_id":   s.id,
            "class_name":   s.class_.name,
            "subject_name": s.subject.name_ar if s.subject else "",
            "exam_type":    s.exam_type,
            "trimester":    s.trimester,
            "is_finalized": s.is_finalized,
            "by":           (editor.full_name or editor.username) if editor else None,
            "at":           e.updated_at.isoformat(),
        })
        if len(activity) >= 8:
            break

    return {
        "role": "director",
        "totals": {
            "teachers":       teachers,
            "classes":        len(classes),
            "students":       students,
            "sessions":       sessions,
            "completion_pct": completion,
        },
        "alerts": {
            "unassigned_classes": unassigned_classes,
        },
        "subject_averages": subject_averages,
        "activity": activity,
        "pairs": pairs,
    }

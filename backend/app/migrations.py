"""Startup migrations — no Alembic.

Two mechanisms, both safe to run on every serverless cold start:
1. ensure_columns(): additive ALTER TABLE for columns created after a table
   already exists (create_all only creates missing tables).
2. run_data_migrations(): one-shot data migrations guarded by the
   schema_migrations key table. The key INSERT shares the transaction with
   the data changes, so a racing cold start either sees the key or fails
   its duplicate INSERT and rolls back. On Postgres we additionally take an
   advisory lock for the whole run.
"""
from datetime import datetime

from sqlalchemy import inspect as sa_inspect, text

from .database import engine, SessionLocal
from .models import (
    SchemaMigration, SchoolSettings, Subject,
    GridTemplate, GridSection, GridCriterion,
    ExamSession,
)

# ── Additive column migrations ───────────────────────────────────────────────

def ensure_columns():
    inspector = sa_inspect(engine)
    with engine.connect() as conn:

        def has_col(table: str, col: str) -> bool:
            return any(c["name"] == col for c in inspector.get_columns(table))

        def add_col(table: str, col: str, definition: str):
            if not has_col(table, col):
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))

        # exam_sessions
        add_col("exam_sessions", "is_finalized", "BOOLEAN DEFAULT FALSE NOT NULL")
        add_col("exam_sessions", "subject_id", "VARCHAR")
        add_col("exam_sessions", "template_id", "VARCHAR")

        # classes
        add_col("classes", "owner_id", "VARCHAR")
        add_col("classes", "level", "VARCHAR")

        # users
        add_col("users", "subject", "VARCHAR")

        # student_scores — legacy bonus / subtotal-override fields
        for col in ["prod_ecriture_bonus", "prod_production_bonus",
                    "lect_vocale_bonus", "lect_comp_bonus",
                    "com_rec_bonus", "com_oral_bonus",
                    "prod_ecriture_st", "prod_production_st",
                    "lect_vocale_st", "lect_comp_st",
                    "com_rec_st", "com_oral_st"]:
            add_col("student_scores", col, "FLOAT")

        conn.commit()


# ── Built-in content definitions ─────────────────────────────────────────────

SUBJECTS = [
    # (code, name_ar, name_fr)
    ("arabe",     "اللغة العربية",     None),
    ("math",      "الرياضيات",         None),
    ("eveil",     "الإيقاظ العلمي",    None),
    ("francais",  "اللغة الفرنسية",    "Français"),
    ("anglais",   "اللغة الإنجليزية",  "Anglais"),
    ("islamique", "التربية الإسلامية", None),
    ("civique",   "التربية المدنية",   None),
    ("histoire",  "التاريخ",           None),
    ("geographie","الجغرافيا",         None),
    ("arts",      "التربية التشكيلية", None),
    ("musique",   "التربية الموسيقية", None),
    ("sport",     "التربية البدنية",   None),
]

# Mirrors the legacy hardcoded French grid (TABS / EXAM_SHEETS / student_scores
# columns). Criterion codes == old column names: they key the Phase-2 data
# migration of student_scores into score_entries.
FRENCH_TEMPLATE = {
    "code": "francais_exam_v1",
    "subject_code": "francais",
    "name": "Français — شبكة التقييم (3 مجالات)",
    "final_formula": "avg_groups",
    "direction": "ltr",
    "sections": [
        {"code": "prod_dictee", "group_key": "prod", "group_label": "Prod. écrite et écriture",
         "label": "Dictée", "has_bonus": False, "allow_st": False, "color_key": "blue",
         "criteria": [("prod_dictee_c4", "C4")]},
        {"code": "prod_ecriture", "group_key": "prod", "group_label": "Prod. écrite et écriture",
         "label": "Écriture", "has_bonus": True, "allow_st": True, "color_key": "blue",
         "criteria": [("prod_ecriture_c2", "C2"), ("prod_ecriture_c7", "C7")]},
        {"code": "prod_production", "group_key": "prod", "group_label": "Prod. écrite et écriture",
         "label": "Prod. écrite", "has_bonus": True, "allow_st": True, "color_key": "blue",
         "criteria": [("prod_production_c1", "C1"), ("prod_production_c3", "C3"),
                      ("prod_production_c5", "C5"), ("prod_production_c6", "C6")]},
        {"code": "lect_vocale", "group_key": "lecture", "group_label": "Lecture",
         "label": "Vocale", "has_bonus": True, "allow_st": True, "color_key": "green",
         "criteria": [("lect_vocale_c1", "C1"), ("lect_vocale_c5", "C5")]},
        {"code": "lect_comp", "group_key": "lecture", "group_label": "Lecture",
         "label": "Compréhension", "has_bonus": True, "allow_st": True, "color_key": "green",
         "criteria": [("lect_comp_c2", "C2"), ("lect_comp_c3", "C3"),
                      ("lect_comp_c4", "C4"), ("lect_comp_c6", "C6")]},
        {"code": "com_rec", "group_key": "com", "group_label": "Com. Orale et Récitation",
         "label": "Récitation", "has_bonus": True, "allow_st": True, "color_key": "orange",
         "criteria": [("com_rec_c1", "C1"), ("com_rec_c2", "C2"),
                      ("com_rec_c3", "C3"), ("com_rec_c4", "C4")]},
        {"code": "com_oral", "group_key": "com", "group_label": "Com. Orale et Récitation",
         "label": "Com. Orale", "has_bonus": True, "allow_st": True, "color_key": "orange",
         "criteria": [("com_oral_c1", "C1"), ("com_oral_c2", "C2"), ("com_oral_c3", "C3"),
                      ("com_oral_c4", "C4"), ("com_oral_c5", "C5"), ("com_oral_c6", "C6")]},
    ],
}


def seed_template(db, spec: dict) -> GridTemplate:
    """Insert a template tree from a spec dict. Caller commits."""
    subject = db.query(Subject).filter_by(code=spec["subject_code"]).first()
    tpl = GridTemplate(
        code=spec["code"],
        subject_id=subject.id,
        name=spec["name"],
        final_formula=spec["final_formula"],
        final_cap=spec.get("final_cap"),
        is_builtin=True,
        direction=spec.get("direction", "rtl"),
    )
    db.add(tpl)
    db.flush()
    for s_idx, s in enumerate(spec["sections"]):
        section = GridSection(
            template_id=tpl.id,
            code=s.get("code"),
            group_key=s["group_key"],
            group_label=s["group_label"],
            label=s["label"],
            order_index=s_idx,
            has_bonus=s.get("has_bonus", True),
            allow_st_override=s.get("allow_st", True),
            color_key=s.get("color_key"),
        )
        db.add(section)
        db.flush()
        for c_idx, (code, label) in enumerate(s["criteria"]):
            db.add(GridCriterion(
                section_id=section.id, code=code, label=label,
                max_score=s.get("max_scores", {}).get(code) if isinstance(s.get("max_scores"), dict) else None,
                order_index=c_idx,
            ))
    return tpl


# ── One-shot data migrations ─────────────────────────────────────────────────

def _once(db, key: str, fn):
    if db.get(SchemaMigration, key):
        return
    fn(db)
    db.add(SchemaMigration(key=key, applied_at=datetime.utcnow()))
    db.commit()


def _seed_subjects(db):
    for i, (code, name_ar, name_fr) in enumerate(SUBJECTS):
        if not db.query(Subject).filter_by(code=code).first():
            db.add(Subject(code=code, name_ar=name_ar, name_fr=name_fr, order_index=i))
    db.flush()


def _seed_french_template(db):
    if not db.query(GridTemplate).filter_by(code=FRENCH_TEMPLATE["code"]).first():
        seed_template(db, FRENCH_TEMPLATE)


def _backfill_sessions_subject(db):
    subject = db.query(Subject).filter_by(code="francais").first()
    template = db.query(GridTemplate).filter_by(code=FRENCH_TEMPLATE["code"]).first()
    db.query(ExamSession).filter(ExamSession.subject_id.is_(None)).update(
        {ExamSession.subject_id: subject.id, ExamSession.template_id: template.id},
        synchronize_session=False,
    )


def _swap_sessions_unique_index(db):
    if engine.dialect.name == "postgresql":
        db.execute(text(
            "ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS "
            "exam_sessions_class_id_trimester_exam_type_key"
        ))
        db.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_class_subj_trim_type "
            "ON exam_sessions (class_id, subject_id, trimester, exam_type)"
        ))
    # SQLite dev: old table-level constraint can't be dropped; recreate the dev
    # DB once (see README). create_all builds the new 4-column shape for fresh DBs.


def _seed_school_settings(db):
    if not db.get(SchoolSettings, 1):
        db.add(SchoolSettings(id=1))


def run_data_migrations():
    db = SessionLocal()
    try:
        if engine.dialect.name == "postgresql":
            # serialize concurrent cold starts
            db.execute(text("SELECT pg_advisory_lock(817223344)"))
        _once(db, "seed_subjects_v1", _seed_subjects)
        _once(db, "seed_template_francais_v1", _seed_french_template)
        _once(db, "backfill_sessions_subject_v1", _backfill_sessions_subject)
        _once(db, "unique_index_sessions_v1", _swap_sessions_unique_index)
        _once(db, "seed_school_settings_v1", _seed_school_settings)
    finally:
        if engine.dialect.name == "postgresql":
            try:
                db.execute(text("SELECT pg_advisory_unlock(817223344)"))
            except Exception:
                pass
        db.close()

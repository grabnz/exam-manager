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
    ExamSession, Class, TeacherAssignment, User,
    StudentScore, ScoreEntry,
)
from .services import grid

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


def _generic_template_spec(subject: Subject) -> dict:
    """Default editable معايير grid for a subject: one domain with 4 criteria
    (each /5 → total /20) + bonus التميز + manual-total override. Directors
    clone and adjust to the official grid of each level."""
    ltr = subject.code == "anglais"
    labels = ["C1", "C2", "C3", "C4"] if ltr else ["مع1", "مع2", "مع3", "مع4"]
    color_cycle = ["teal", "purple", "rose", "green", "orange", "blue"]
    color = color_cycle[(subject.order_index or 0) % len(color_cycle)]
    return {
        "code": f"{subject.code}_generic_v1",
        "subject_code": subject.code,
        "name": f"{subject.name_ar} — شبكة المعايير",
        "final_formula": "sum_sections",
        "direction": "ltr" if ltr else "rtl",
        "sections": [
            {"code": f"{subject.code}_main", "group_key": "main",
             "group_label": subject.name_fr if ltr and subject.name_fr else subject.name_ar,
             "label": "Critères" if ltr else "معايير التقييم",
             "has_bonus": True, "allow_st": True, "color_key": color,
             "criteria": [(f"{subject.code}_m{i+1}", lbl) for i, lbl in enumerate(labels)],
             "max_scores": {f"{subject.code}_m{i+1}": 5.0 for i in range(4)}},
        ],
    }


def _seed_all_subject_templates(db):
    """Every active subject gets a starter grid (skip those that have one)."""
    for subject in db.query(Subject).filter_by(is_active=True).all():
        has_template = db.query(GridTemplate).filter_by(subject_id=subject.id).first()
        if not has_template:
            seed_template(db, _generic_template_spec(subject))
    db.flush()


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


def _migrate_scores_to_entries(db):
    """Convert legacy 34-column student_scores rows into generic score_entries
    JSON keyed by the French template's criterion/section ids. The legacy table
    is left untouched (archive / rollback safety)."""
    template = db.query(GridTemplate).filter_by(code=FRENCH_TEMPLATE["code"]).first()

    # code → id maps from the seeded template
    crit_by_code = {}
    sec_by_code = {}
    for section in template.sections:
        sec_by_code[section.code] = section
        for c in section.criteria:
            crit_by_code[c.code] = c.id

    migrated = 0
    for row in db.query(StudentScore).all():
        exists = db.query(ScoreEntry).filter_by(
            session_id=row.session_id, student_id=row.student_id
        ).first()
        if exists:
            continue

        criteria = {}
        for code, cid in crit_by_code.items():
            criteria[cid] = getattr(row, code, None)
        sections = {}
        for code, section in sec_by_code.items():
            if section.has_bonus or section.allow_st_override:
                sections[section.id] = {
                    "bonus": getattr(row, f"{code}_bonus", None),
                    "st":    getattr(row, f"{code}_st", None),
                }
        values = {"criteria": criteria, "sections": sections}

        db.add(ScoreEntry(
            session_id=row.session_id,
            student_id=row.student_id,
            values=values,
            final_score=grid.final_score(template, values),
            updated_at=datetime.utcnow(),
        ))
        migrated += 1
    db.flush()
    print(f"[migrations] migrated {migrated} student_scores rows to score_entries")


def _backfill_assignments(db):
    """Convert legacy class ownership into (teacher, class, français)
    assignments. Classes owned by an admin (or unowned) stay unassigned —
    the director assigns them from the console."""
    francais = db.query(Subject).filter_by(code="francais").first()
    classes = db.query(Class).filter(Class.owner_id.isnot(None)).all()
    for c in classes:
        owner = db.get(User, c.owner_id)
        if not owner or owner.role != "teacher":
            continue
        exists = db.query(TeacherAssignment).filter_by(
            teacher_id=owner.id, class_id=c.id, subject_id=francais.id
        ).first()
        if not exists:
            db.add(TeacherAssignment(
                teacher_id=owner.id, class_id=c.id, subject_id=francais.id
            ))
    db.flush()


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
        _once(db, "backfill_assignments_v1", _backfill_assignments)
        _once(db, "migrate_scores_to_entries_v1", _migrate_scores_to_entries)
        _once(db, "seed_templates_all_v1", _seed_all_subject_templates)
    finally:
        if engine.dialect.name == "postgresql":
            try:
                db.execute(text("SELECT pg_advisory_unlock(817223344)"))
            except Exception:
                pass
        db.close()

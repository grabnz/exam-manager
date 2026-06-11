import os
from sqlalchemy import inspect as sa_inspect, text

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base, SessionLocal
from .routers import classes, sessions, scores, profile, auth as auth_router, users
from .auth import hash_password

# ── Create new tables (idempotent) ───────────────────────────────────────────
Base.metadata.create_all(bind=engine)

# ── Auto-migrate: add any missing columns to existing tables ─────────────────
def _ensure_columns():
    """Add columns that may be missing due to schema evolution.
    SQLAlchemy create_all() only creates new tables, not new columns.
    This runs safely on every cold start.
    """
    inspector = sa_inspect(engine)
    with engine.connect() as conn:

        def has_col(table: str, col: str) -> bool:
            return any(c["name"] == col for c in inspector.get_columns(table))

        def add_col(table: str, col: str, definition: str):
            if not has_col(table, col):
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))

        # exam_sessions
        add_col("exam_sessions", "is_finalized", "BOOLEAN DEFAULT FALSE NOT NULL")

        # classes — multi-teacher ownership
        add_col("classes", "owner_id", "VARCHAR")

        # student_scores — bonus fields
        for col in ["prod_ecriture_bonus", "prod_production_bonus",
                    "lect_vocale_bonus", "lect_comp_bonus",
                    "com_rec_bonus", "com_oral_bonus"]:
            add_col("student_scores", col, "FLOAT")

        # student_scores — direct subtotal overrides
        for col in ["prod_ecriture_st", "prod_production_st",
                    "lect_vocale_st", "lect_comp_st",
                    "com_rec_st", "com_oral_st"]:
            add_col("student_scores", col, "FLOAT")

        conn.commit()


def _bootstrap_admin():
    """Create the initial admin account if no users exist.
    Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD env vars
    (defaults: admin / admin123 — forced to change password on first login).
    Existing classes without an owner are assigned to this admin so legacy
    data stays reachable.
    """
    from .models import User, Class, TeacherProfile

    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return
        username = os.getenv("ADMIN_USERNAME", "admin").strip().lower()
        password = os.getenv("ADMIN_PASSWORD", "admin123")

        # Carry over the legacy single-teacher profile, if any
        legacy = db.query(TeacherProfile).first()

        admin = User(
            username=username,
            password_hash=hash_password(password),
            full_name=legacy.name if legacy else "",
            grade=legacy.grade if legacy else "",
            role="admin",
            must_change_password=True,
        )
        db.add(admin)
        db.flush()

        db.query(Class).filter(Class.owner_id.is_(None)).update(
            {Class.owner_id: admin.id}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


try:
    _ensure_columns()
    _bootstrap_admin()
except Exception:
    pass   # never block startup; DB may be temporarily unreachable


app = FastAPI(title="Exam Score Manager", version="1.0.0")

_raw = os.getenv("ALLOWED_ORIGINS", "*")
origins = [o.strip() for o in _raw.split(",")] if _raw != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(users.router)
app.include_router(classes.router)
app.include_router(classes.students_router)
app.include_router(sessions.router)
app.include_router(scores.router)
app.include_router(profile.router)


@app.get("/health")
def health():
    return {"status": "ok"}

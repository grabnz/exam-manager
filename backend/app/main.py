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
    Legacy classes (no owner) stay unowned: the admin sees them and assigns
    them to the right teacher from the admin page.

    Recovery: if ADMIN_FORCE_RESET=1, the admin's password is reset from
    ADMIN_PASSWORD on startup (only useful when the admin password is lost;
    remove the variable afterwards).
    """
    from .models import User

    db = SessionLocal()
    try:
        username = (os.getenv("ADMIN_USERNAME") or "admin").strip().lower()
        password = os.getenv("ADMIN_PASSWORD") or "admin123"
        force_reset = os.getenv("ADMIN_FORCE_RESET") == "1"

        admin = db.query(User).filter_by(username=username).first()
        if admin:
            if force_reset:
                admin.password_hash = hash_password(password)
                admin.must_change_password = True
                db.commit()
            return
        if db.query(User).count() > 0:
            return

        admin = User(
            username=username,
            password_hash=hash_password(password),
            role="admin",
            must_change_password=True,
        )
        db.add(admin)
        db.commit()
    finally:
        db.close()


try:
    _ensure_columns()
except Exception as e:
    print(f"[startup] column migration failed: {e!r}")  # visible in serverless logs

try:
    _bootstrap_admin()
except Exception as e:
    print(f"[startup] admin bootstrap failed: {e!r}")


app = FastAPI(title="Exam Score Manager", version="1.0.0")

_raw = os.getenv("ALLOWED_ORIGINS") or "*"
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

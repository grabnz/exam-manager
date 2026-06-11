import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base, SessionLocal
from .routers import (
    classes, sessions, scores, profile, users,
    auth as auth_router, subjects, templates,
    assignments, settings, stats, calendar, documents,
)
from .auth import hash_password
from . import migrations

# ── Create new tables (idempotent) ───────────────────────────────────────────
Base.metadata.create_all(bind=engine)


def _bootstrap_admin():
    """Create the initial admin (director) account if no users exist.
    Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD env vars
    (defaults: admin / admin123 — forced to change password on first login).
    Legacy classes (no owner) stay unowned: the director sees them and assigns
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
    migrations.ensure_columns()
except Exception as e:
    print(f"[startup] column migration failed: {e!r}")  # visible in serverless logs

try:
    migrations.run_data_migrations()
except Exception as e:
    print(f"[startup] data migrations failed: {e!r}")

try:
    _bootstrap_admin()
except Exception as e:
    print(f"[startup] admin bootstrap failed: {e!r}")


app = FastAPI(title="Exam Score Manager", version="2.0.0")

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
app.include_router(subjects.router)
app.include_router(templates.router)
app.include_router(assignments.router)
app.include_router(settings.router)
app.include_router(stats.router)
app.include_router(calendar.router)
app.include_router(documents.router)
app.include_router(classes.router)
app.include_router(classes.students_router)
app.include_router(sessions.router)
app.include_router(scores.router)
app.include_router(profile.router)


@app.get("/health")
def health():
    return {"status": "ok"}

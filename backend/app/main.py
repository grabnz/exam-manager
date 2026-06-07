import os
from sqlalchemy import inspect as sa_inspect, text

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import classes, sessions, scores, profile

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

try:
    _ensure_columns()
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

app.include_router(classes.router)
app.include_router(sessions.router)
app.include_router(scores.router)
app.include_router(profile.router)


@app.get("/health")
def health():
    return {"status": "ok"}

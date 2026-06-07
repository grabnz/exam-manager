import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import classes, sessions, scores, profile

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Exam Score Manager", version="1.0.0")

# ALLOWED_ORIGINS env var: comma-separated list e.g. "https://exam-manager.vercel.app"
# Falls back to wildcard for local development.
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

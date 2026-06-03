from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import classes, sessions, scores

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Exam Score Manager", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(classes.router)
app.include_router(sessions.router)
app.include_router(scores.router)


@app.get("/health")
def health():
    return {"status": "ok"}

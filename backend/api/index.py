import sys
import os

# Make the backend package importable from the Vercel serverless context
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app  # noqa: F401 — Vercel picks up the ASGI `app` object

# دفتر الأعداد — Primary School Score Manager

School-wide score management for Tunisian primary schools (التقييم بالمعايير):
director → teachers → classes → pupils, multi-subject grids, offline-capable
classroom score entry, Excel export and printable finale sheets.

- **Backend:** FastAPI + SQLAlchemy — SQLite locally, PostgreSQL (Neon) in production, deployed as a Vercel serverless function (`backend/api/index.py`).
- **Frontend:** React + Vite + Tailwind (Arabic RTL), installable **PWA** that works offline, deployed on Vercel.
- **National scale-up:** see [NATIONAL_ARCHITECTURE.md](NATIONAL_ARCHITECTURE.md).

## Organization & roles

There is **no public sign-up** — accounts are provisioned top-down:

- **مدير (director, role `admin`)** — manages teacher accounts, classes and
  pupil lists (manual or PDF import), assigns teachers to (class × subject),
  customizes grid templates, school settings, and is the only one who can
  unlock finalized sessions.
- **معلم (teacher)** — sees only the classes/subjects assigned to them
  (a 1st-year teacher can be assigned every subject of their class), enters
  scores per session (تقييم 0..N + امتحان per trimester), finalizes sessions.

On first boot with an empty user table, a bootstrap admin is created from
`ADMIN_USERNAME` / `ADMIN_PASSWORD` (defaults `admin` / `admin123`) and must
change its password at first login. Recovery: set `ADMIN_FORCE_RESET=1` for
one deployment to reset the admin password from `ADMIN_PASSWORD`.

## Score grids (شبكات التقييم)

Each subject has grid templates: مجالات → أقسام → معايير with optional max
scores, bonus (التميز), manual subtotal override, and a final formula
(average of domains / sum / capped sum). Built-in templates ship for all 12
subjects (the French 3-domain exam grid is preserved exactly). Built-ins are
immutable — the director clones and edits copies; **sessions pin their
template forever**, so editing grids never changes recorded history.

## Offline classroom use

The app installs as a PWA («دفتر الأعداد»). A class opened once online stays
available offline; score saves made without network are stored locally and
synced automatically on reconnection, with a conflict dialog if the session
was modified from another device meanwhile.

## Environment variables (backend)

| Variable | Required in prod | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | `sqlite:///./exam_manager.db` | Postgres connection string (Neon/Railway) |
| `SECRET_KEY` | **yes** | `dev-secret-change-me` | JWT signing key — set a long random value |
| `ADMIN_USERNAME` | no | `admin` | Bootstrap admin username (first boot only) |
| `ADMIN_PASSWORD` | recommended | `admin123` | Bootstrap admin temporary password |
| `ADMIN_FORCE_RESET` | no | — | `1` = reset admin password on boot (recovery) |
| `TOKEN_TTL_HOURS` | no | `72` | Login session lifetime |
| `ALLOWED_ORIGINS` | recommended | `*` | Comma-separated CORS origins (the frontend URL) |

Frontend: `VITE_API_URL` — base URL of the backend (empty = same origin).

Generate a secret key: `python -c "import secrets; print(secrets.token_urlsafe(48))"`

## Local development

```bash
# Backend
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

First login: `admin` / `admin123` (you will be asked to change it).

Database migrations are automatic on startup: missing tables/columns are
added, and one-shot data migrations (seeds, backfills, legacy score
conversion) run exactly once, guarded by the `schema_migrations` table.
If you have a very old local `exam_manager.db`, delete it once (the
`exam_sessions` uniqueness changed and SQLite cannot alter constraints).

## Production deployment checklist

1. Set `SECRET_KEY`, `ADMIN_PASSWORD`, `ALLOWED_ORIGINS`, `DATABASE_URL` in
   the backend's Vercel project settings, then deploy.
2. Log in as admin → change the password when prompted.
3. لوحة المدير: create teacher accounts (الحسابات), classes & pupils
   (الأقسام), assign teachers to subjects (الإسناد), fill school info
   (الإعدادات), adjust grids if needed (شبكات التقييم).
4. Teachers log in, change their temporary password, and see their
   قسم × مادة cards.

# إدارة النقاط — Exam Score Manager

Score management app for French-language exams in Tunisian primary schools
(تقييم / امتحان per trimester, PDF class import, Excel export, printable finale sheets).

- **Backend:** FastAPI + SQLAlchemy — SQLite locally, PostgreSQL (Neon) in production, deployed as a Vercel serverless function (`backend/api/index.py`).
- **Frontend:** React + Vite + Tailwind (Arabic RTL), deployed on Vercel.

## Authentication model

There is **no public sign-up**. Accounts are provisioned by the school
administration (director):

- On first startup with an empty user table, a bootstrap **admin** account is
  created from `ADMIN_USERNAME` / `ADMIN_PASSWORD` (defaults: `admin` / `admin123`)
  and is forced to change its password on first login. Any pre-existing classes
  are assigned to this admin.
- The admin creates **teacher** accounts from the in-app
  "إدارة الحسابات" page (hamburger menu → 🛡️), hands each teacher a temporary
  password, and can reset passwords, deactivate accounts, or reassign classes.
- Every new/reset account must change its password at first login.
- Teachers only see and manage **their own classes**; admins see everything.
- Auth is JWT (`Authorization: Bearer …`), passwords are PBKDF2-SHA256 hashed.

## Environment variables (backend)

| Variable | Required in prod | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | `sqlite:///./exam_manager.db` | Postgres connection string (Neon/Railway) |
| `SECRET_KEY` | **yes** | `dev-secret-change-me` | JWT signing key — set a long random value |
| `ADMIN_USERNAME` | no | `admin` | Bootstrap admin username (first boot only) |
| `ADMIN_PASSWORD` | recommended | `admin123` | Bootstrap admin temporary password (first boot only) |
| `TOKEN_TTL_HOURS` | no | `72` | Login session lifetime |
| `ALLOWED_ORIGINS` | recommended | `*` | Comma-separated CORS origins (set to the frontend URL) |

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

## Production deployment checklist

1. Set `SECRET_KEY`, `ADMIN_PASSWORD`, `ALLOWED_ORIGINS`, `DATABASE_URL` in the
   backend's Vercel project settings, then redeploy.
2. Log in as admin → change the password when prompted.
3. Create teacher accounts in إدارة الحسابات; assign any legacy
   "أقسام بدون معلم" to the right teacher.
4. Schema migrations are automatic: missing tables/columns are added on cold
   start (`backend/app/main.py`).

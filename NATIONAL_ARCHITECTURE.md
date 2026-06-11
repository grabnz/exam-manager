# دفتر الأعداد — منظومة وطنية لإدارة أعداد التقييمات بالمرحلة الابتدائية
## National Architecture Proposal — Primary School Score Management Platform

---

## 1. الرؤية (Vision)

منظومة رقمية وطنية تمكّن كل معلم في المدرسة الابتدائية التونسية من تسجيل أعداد
التقييمات والامتحانات **مباشرة في القسم، حتى دون اتصال بالإنترنت**، وتمنح
الإدارة والسلط الجهوية والوزارة رؤية فورية وموثوقة على نتائج التعلّم، عوضاً عن
الدفاتر الورقية وجداول Excel المشتتة.

المنظومة الحالية تعمل فعلياً في مدرسة واحدة (نموذج تجريبي مكتمل الوظائف):
حسابات مؤمَّنة يمنحها المدير، إسناد المعلمين إلى الأقسام والمواد، شبكات تقييم
بالمعايير قابلة للتخصيص لكل مادة، إدخال الأعداد من الهاتف داخل القسم مع عمل
كامل دون اتصال، تصدير Excel ووثائق طباعة رسمية.

This document describes how the working single-school product scales to a
national platform (~4,500 primary schools, ~1.1M pupils, ~70k teachers).

---

## 2. Current architecture (deployed pilot)

```
 Teacher phone/PC (PWA, offline-capable)
        │ HTTPS + JWT
        ▼
 React SPA (Vite, Arabic RTL)  ──static──  CDN (Vercel)
        │ /api
        ▼
 FastAPI (serverless containers)
        │ SQLAlchemy
        ▼
 PostgreSQL (Neon, managed)
```

Key properties already in production:
- **Roles & provisioning**: no self-signup. Director (مدير) creates teacher
  accounts; forced password change at first login; PBKDF2 password hashing;
  JWT sessions.
- **Organizational model**: school owns classes & pupils; teachers access only
  the (class × subject) pairs assigned to them — including the first-degree
  case of one teacher carrying all subjects of their class.
- **Assessment model (التقييم بالمعايير)**: each subject has versioned grid
  templates (مجالات → أقسام → معايير with max scores, bonus التميز, manual
  totals). Sessions pin their template forever: changing a grid never rewrites
  history. Finalized sessions are immutable; only the director can unlock.
- **Offline-first**: installable PWA; score grids work with no connectivity;
  saves queue locally (IndexedDB) and sync automatically with conflict
  detection (HTTP 409 + last-write-wins with explicit teacher confirmation).
- **Outputs**: per-session Excel workbooks and printable finale sheets with
  the school/المندوبية header.

## 3. Multi-tenancy plan (school → national)

**Recommended: single database, row-scoped tenancy.**

- Add a `schools` table (`id, name, code_etab, region_id, is_active`).
- Add `school_id` to `users`, `classes`, `school_settings`; every query in the
  permission layer is already centralized (`get_visible_class`,
  `get_accessible_session`) — scoping by `school_id` is a one-layer change.
- Harden with PostgreSQL **Row-Level Security** as a second enforcement layer
  (`SET app.school_id = …` per request; policies on every tenant table).
- Login: national username = `code_etab.username` or a school picker; same
  JWT carries `school_id`.

Rejected alternatives:
- *Database-per-school*: 4,500 databases — operationally heavy migrations,
  cross-school reporting requires ETL; unnecessary at this data volume.
- *Schema-per-school*: same drawbacks with worse tooling support.

## 4. Role hierarchy & permission matrix

| Capability | معلم | مدير المدرسة | متفقد الدائرة | المندوبية الجهوية | الوزارة |
|---|---|---|---|---|---|
| Enter/edit scores (assigned class×subject) | ✔ | ✔ | — | — | — |
| Finalize a session | ✔ | ✔ | — | — | — |
| Unlock a finalized session | — | ✔ | — | — | — |
| Manage pupils/classes/assignments | — | ✔ | — | — | — |
| Provision accounts | — | ✔ (teachers) | — | ✔ (directors) | ✔ (all) |
| Customize grid templates | — | ✔ | propose | validate regional | publish national |
| Read scores | own | school | assigned schools (read-only) | region aggregates | national aggregates (anonymized) |

The two school-level roles exist today (`teacher`, `admin`); inspector and
above are additive read-only roles over the same data model.

## 5. Identity & integration

- Accounts remain **provisioned top-down** (no self-signup), matching ministry
  practice. Bulk import of teachers/directors from ministry HR files (CSV).
- Pupils: map `students.id` to **المعرّف الوحيد للتلميذ** to enable transfers
  between schools and longitudinal tracking.
- SSO-ready: the JWT issuance layer is isolated in `app/auth.py`; replacing
  password login with a ministry IdP (OIDC) touches one module.

## 6. Reporting & analytics

- `score_entries.final_score` is denormalized at save time → regional and
  national aggregates (mean per subject/level/trimester, completion rates,
  finalization progress) are plain SQL `GROUP BY` over indexed columns.
- Nightly **materialized views** per (school, subject, level, trimester) feed
  dashboards without touching hot tables.
- If per-criterion national analytics is ever mandated, the JSON `values`
  column converts cleanly to a criterion-level fact table (EAV) by a batch
  job — the criterion ids are already stable and template-versioned.

## 7. Data protection (القانون عدد 63 لسنة 2004 / INPDP)

- Data minimization: pupils are stored as name + order only — no addresses,
  no health data, no photos.
- Access is strictly role-scoped; finalized results immutable; every write
  records `updated_by` + timestamp (extend to a full audit table at national
  scale: actor, action, entity, before/after).
- Retention: scores archived per school year; deletion workflow for pupils
  leaving the system; INPDP declaration before national rollout.
- Hosting on Tunisian soil at national stage (see §8).

## 8. Infrastructure sovereignty & scale

The pilot runs on Vercel + Neon for speed of iteration. The application is
**deliberately portable**: stateless FastAPI + standard PostgreSQL, all
configuration via environment variables.

Migration path to ministry-hosted infrastructure (CNI or agreed datacenter):
1. `docker compose`: FastAPI containers behind nginx + managed PostgreSQL.
2. Point `DATABASE_URL` at the national cluster; no code changes.
3. Replace the cold-start migration runner with **Alembic** (the existing
   `schema_migrations` key table converts directly).

Scale estimate (~4,500 schools, 1.1M pupils, 70k teachers):
- Score data: ~1.1M pupils × ~10 subjects × ~9 sessions/year ≈ 100M rows/year
  of small JSON rows ≈ low tens of GB/year — comfortable for one PostgreSQL
  cluster with partitioning by school year.
- Writes are bursty around evaluation periods; the offline queue naturally
  smooths spikes (saves are idempotent per (session, student)).
- The SPA is static and CDN-served; API nodes scale horizontally (stateless).

## 9. Offline-first as a national equity feature

Rural connectivity is the main obstacle for any classroom digital tool. This
platform was designed offline-first from day one:
- The app installs on any Android phone/tablet (no store account needed).
- A teacher loads their class once (any connectivity), then enters scores in
  the classroom with **zero network**; syncing happens automatically later —
  including conflict-safe merging when a teacher uses two devices.
- This is a differentiator versus web-only solutions and the key argument for
  equal adoption in interior regions.

## 10. Rollout plan

1. **Pilot school** (current deployment) — full year of real use.
2. **Circonscription pilot** (10–20 schools, one inspector) — adds the
   multi-school layer (§3) and the inspector read-only role.
3. **Regional** (one مندوبية) — bulk provisioning, training-of-trainers,
   regional dashboard.
4. **National** — ministry hosting (§8), SSO, المعرّف الوحيد integration,
   support organization (hotline + school champions).

Each stage reuses the same codebase; stages differ only in tenancy scope,
hosting, and provisioning tooling.

---

*Prepared from the working pilot at `exam-manager` — backend FastAPI/PostgreSQL,
frontend React PWA (Arabic RTL), full source available for audit.*

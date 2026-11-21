# MediCare — Clinic Appointment & E-Prescription Platform

Full-stack system for a (fictional) Jaipur health-insurance TPA: patients book appointments, doctors issue
e-prescriptions, admins see operational analytics built from cleaned data of 4 hospitals.

**Stack:** React 18 (Vite) · Node 20 + Express · PostgreSQL 16 · JWT (access + rotating refresh) · GitHub Actions · Vercel + Render

| | |
|---|---|
| Live frontend | _add your Vercel URL here_ |
| Live API | _add your Render URL here_ (`/health`) |
| Report (Word, for upload) | [`docs/Project_Report.docx`](docs/Project_Report.docx) |
| Docs | [`docs/API.md`](docs/API.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/SCALING.md`](docs/SCALING.md) · [`docs/architecture.png`](docs/architecture.png) |

## Requirement coverage

| # | Requirement | Where |
|---|---|---|
| 2-3 | React + Node/Express + PostgreSQL | `frontend/`, `backend/`, `backend/db/schema.sql` |
| 4 | Seed from messy 4-hospital data (free-text diagnoses, missing discharge dates, duplicate patients) | `backend/scripts/generate-raw.js` → `src/utils/cleaning.js` → `src/services/pipeline.js` → `scripts/seed.js` |
| 5 | Sign-up/login, JWT + refresh, RBAC, CRUD ×3 (patients, appointments, prescriptions; + doctors), search + filters, file upload, admin dashboard (avg LOS, bed occupancy, 30-day readmission) | `src/routes/*`, `src/services/metrics.js`, `frontend/src/pages/*` |
| 6 | Client + server validation, consistent errors, logging | `frontend/src/validators.js`, `src/schemas.js` (zod), `src/middleware/error.js`, `src/logger.js` |
| 7 | Unit + API tests, GitHub Actions, Vercel/Render, env config | `backend/tests`, `frontend/src/*.test.js`, `.github/workflows/ci.yml`, `render.yaml`, `vercel.json` |
| 8 | Email notifications + background queue (stretch) | `src/services/jobs.js` (Postgres `SKIP LOCKED` queue) |
| 9 | No secrets in repo; pages < 2 s | `.env.example` only, gitleaks in CI, route code-splitting, DB indexes, paginated APIs |
| 10 | Repo, API docs, architecture diagram, README | this repo |
| 11 | Scaling the weakest part | [`docs/SCALING.md`](docs/SCALING.md) |

## Run locally

Prerequisites: Node 20+, PostgreSQL 14+ (or Docker).

```bash
# 1. database
docker compose up -d db                       # or use your own Postgres and set DATABASE_URL

# 2. backend
cd backend
cp .env.example .env                          # then set JWT_ACCESS_SECRET
npm install
npm run generate-raw                          # (optional) regenerate the synthetic raw CSVs
npm run seed                                  # cleans data, loads DB, prints demo logins ONCE
npm run dev                                   # http://localhost:4000/health

# 3. frontend (new terminal)
cd frontend
npm install
npm run dev                                   # http://localhost:5173  (proxies /api to :4000)
```

Everything in one go: `docker compose up --build` then `docker compose exec api node scripts/seed.js`.

### Tests
```bash
cd backend  && npm run test:unit                       # no database needed (cleaning, metrics, tokens, validation)
cd backend  && DATABASE_URL=postgres://... npm test    # + end-to-end API tests on a real DB
cd frontend && npm test
```

### Deploy
1. **Render** → New → Blueprint → select repo (`render.yaml` creates the API and the Postgres DB). Set `CORS_ORIGIN` to your Vercel URL. After first deploy run `npm run seed` once from the Render shell.
2. **Vercel** → import repo, root directory `frontend`, env `VITE_API_URL=<Render API URL>`.
3. GitHub → Settings → Secrets: `RENDER_DEPLOY_HOOK_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Pushes to `main` then test → scan → deploy automatically.
4. Run `npm install` once in `backend/` and `frontend/` and commit the generated `package-lock.json` files (reproducible builds).

> Render's free disk is ephemeral: uploaded files are lost on redeploy unless you attach a persistent disk or move uploads to S3/Cloudinary (see SCALING.md).

## Roles

| Role | Can |
|---|---|
| patient (self sign-up) | book/cancel own appointments, read own prescriptions, edit own profile |
| doctor (created by admin) | see own schedule, complete appointments, issue/edit/delete own prescriptions, upload attachments, search patients |
| admin | everything above + CRUD patients/doctors, delete appointments, dashboard |

## Data cleaning decisions

| Problem in raw data | Handling |
|---|---|
| Diagnosis as free text | keyword → ICD-10 style mapping; unmapped kept as text and counted in the dashboard "data quality" panel |
| Mixed date formats (`2025-03-09`, `09/03/2025`, `9 Mar 2025`) | parsed day-first (Indian), impossible dates rejected |
| Missing discharge date | admitted ≤ 45 days before the snapshot ⇒ **still admitted**; older ⇒ `missing_discharge` defect, excluded from length-of-stay/occupancy and reported |
| Same patient registered twice with different IDs | merged when DOB equal AND (name equal / phone equal / name within edit-distance 2); all source IDs kept in `patients.source_ids` |

Metric definitions: **LOS** = mean(discharge − admit, min 1 day) over discharged stays. **Occupancy** = admitted beds on the snapshot date ÷ total beds. **30-day readmission** = discharges followed by a new admission of the same patient within 30 days ÷ all discharges.

## Security checklist
bcrypt password hashes · refresh tokens stored hashed, rotated, reuse ⇒ revoke all · short-lived access token (15 min) · role never accepted from the client · row-level access (other users' records return 404) · parameterised SQL only · zod validation, body size limit, rate limit on auth · helmet · uploads: type/size allow-list, random server-side file names, served only through an authorised endpoint · production refuses to start without a strong `JWT_ACCESS_SECRET` · logs redact secrets.

## Demo data note
All data is synthetic (generated, deterministic) and contains no real patient information.

# Scaling the weakest part

## What is weakest?
**The admin dashboard analytics.** `GET /api/admin/dashboard` loads every row of `admissions` into Node and computes length of stay, occupancy and readmissions in JavaScript. That is fine for 500 rows (the seed) but becomes memory- and CPU-bound at millions of rows, and one slow dashboard call blocks the event loop used by all other requests. Close runners-up: in-memory rate limiter / cache (per-instance) and local-disk uploads (not shared between instances).

## Plan, in order of cost
1. **Push the maths into SQL** (same definitions as `metrics.js`, which stays as the reference implementation and test oracle). These queries were run against the seeded database and return the same figures as the JS code: LOS 6.03 days, occupancy 67.67 %, readmission 19.06 % (53 / 278).
   ```sql
   -- avg length of stay
   SELECT round(avg(GREATEST(1, discharge_date - admit_date)), 2) FROM admissions WHERE status='discharged';
   -- bed occupancy snapshot
   SELECT count(*) FILTER (WHERE status='admitted' AND admit_date <= current_date)::float / :total_beds FROM admissions;
   -- 30-day readmission (index stays = discharged; "next" = the patient's next admission of any status)
   SELECT count(*) FILTER (WHERE next_admit IS NOT NULL AND next_admit - discharge_date <= 30)::numeric / count(*)
   FROM (SELECT status, discharge_date,
                lead(admit_date) OVER (PARTITION BY patient_id ORDER BY admit_date, id) AS next_admit
         FROM admissions WHERE status <> 'invalid' AND admit_date IS NOT NULL) s
   WHERE status = 'discharged';
   ```
   Indexes already exist on `(patient_id, admit_date)` and `(hospital_id, status)`; add `(status, discharge_date)` if needed.
2. **Pre-aggregate**: a `daily_hospital_stats` table or materialised view refreshed by the existing job queue (`REFRESH MATERIALIZED VIEW CONCURRENTLY` every few minutes or on admission change). Dashboard reads become O(hospitals × days).
3. **Cache in Redis** (shared by all API instances) instead of the per-process Map; use Redis for the auth rate limiter too.
4. **Read replica** for analytics queries so reporting never competes with bookings.
5. **Horizontal scale**: API is stateless (JWT) → run N instances behind the platform load balancer; move uploads to S3/Cloudinary with signed URLs; run workers as a separate process (`SKIP LOCKED` already makes that safe).
6. **Partition** `admissions`/`billing` by year when they pass ~50 M rows.

## How to prove it
Load-test with k6 (e.g. 200 virtual users on `/api/admin/dashboard` and `/api/appointments`), watch p95 latency and event-loop lag before and after step 1; target p95 < 300 ms for the dashboard at 5 M admissions.

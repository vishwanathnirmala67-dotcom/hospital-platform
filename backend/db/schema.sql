-- Hospital platform schema (PostgreSQL 14+). Idempotent: safe to run on every deploy.
CREATE TABLE IF NOT EXISTS hospitals (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  total_beds  INT  NOT NULL CHECK (total_beds > 0)
);

CREATE TABLE IF NOT EXISTS patients (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  dob         DATE,
  gender      TEXT NOT NULL DEFAULT 'unknown' CHECK (gender IN ('male','female','other','unknown')),
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT,
  source_ids  TEXT[] NOT NULL DEFAULT '{}',          -- original "hospital:localId" keys merged into this record
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patients_name_idx  ON patients (lower(name));
CREATE INDEX IF NOT EXISTS patients_phone_idx ON patients (phone);

CREATE TABLE IF NOT EXISTS doctors (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  specialization TEXT NOT NULL,
  hospital_id    INT REFERENCES hospitals(id)
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('patient','doctor','admin')),
  patient_id    INT REFERENCES patients(id) ON DELETE SET NULL,
  doctor_id     INT REFERENCES doctors(id)  ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,                 -- SHA-256 of the token; the raw token is never stored
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS refresh_user_idx ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS appointments (
  id          SERIAL PRIMARY KEY,
  patient_id  INT  NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id   INT  NOT NULL REFERENCES doctors(id),
  starts_at   TIMESTAMPTZ NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','completed','cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A doctor cannot be double-booked for the same slot (unless the earlier one was cancelled).
CREATE UNIQUE INDEX IF NOT EXISTS appt_doctor_slot_uq ON appointments (doctor_id, starts_at) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS appt_patient_idx ON appointments (patient_id, starts_at);
CREATE INDEX IF NOT EXISTS appt_doctor_idx  ON appointments (doctor_id, starts_at);

CREATE TABLE IF NOT EXISTS prescriptions (
  id             SERIAL PRIMARY KEY,
  appointment_id INT REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id     INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id      INT NOT NULL REFERENCES doctors(id),
  diagnosis      TEXT NOT NULL,
  medicines      JSONB NOT NULL DEFAULT '[]',        -- [{name,dose,frequency,days}]
  notes          TEXT NOT NULL DEFAULT '',
  attachment     TEXT,                               -- stored file name (not a path)
  attachment_mime TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rx_patient_idx ON prescriptions (patient_id, created_at DESC);

-- Seeded, cleaned operational data ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admissions (
  id             SERIAL PRIMARY KEY,
  hospital_id    INT NOT NULL REFERENCES hospitals(id),
  patient_id     INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ward           TEXT,
  bed_no         TEXT,
  admit_date     DATE,
  discharge_date DATE,
  status         TEXT NOT NULL CHECK (status IN ('admitted','discharged','missing_discharge','invalid')),
  diagnosis_code TEXT,
  diagnosis_text TEXT,
  flags          TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS adm_patient_idx ON admissions (patient_id, admit_date);
CREATE INDEX IF NOT EXISTS adm_hospital_idx ON admissions (hospital_id, status);

CREATE TABLE IF NOT EXISTS opd_visits (
  id SERIAL PRIMARY KEY, hospital_id INT NOT NULL REFERENCES hospitals(id), patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL, department TEXT, complaint TEXT, diagnosis_code TEXT
);
CREATE TABLE IF NOT EXISTS lab_tests (
  id SERIAL PRIMARY KEY, hospital_id INT NOT NULL REFERENCES hospitals(id), patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL, test_date DATE NOT NULL, result_value NUMERIC, unit TEXT
);
CREATE TABLE IF NOT EXISTS billing (
  id SERIAL PRIMARY KEY, hospital_id INT NOT NULL REFERENCES hospitals(id), patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('OPD','IPD')), amount_inr NUMERIC(12,2) NOT NULL, insurer_claim BOOLEAN NOT NULL DEFAULT false
);

-- Background job queue (stretch): workers claim rows with FOR UPDATE SKIP LOCKED.
CREATE TABLE IF NOT EXISTS jobs (
  id         SERIAL PRIMARY KEY,
  type       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  attempts   INT NOT NULL DEFAULT 0,
  run_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_pending_idx ON jobs (run_at) WHERE status = 'pending';

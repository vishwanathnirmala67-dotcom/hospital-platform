'use strict';
/**
 * Seeds the DB from the 4 hospitals' raw CSV exports AFTER cleaning (see src/services/pipeline.js).
 * Also creates an admin, demo doctors and one demo patient login. Passwords come from env (never hard-coded);
 * if unset, a random one is generated and printed once.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../src/db');
const { migrate } = require('./migrate');
const { buildCleanDataset } = require('../src/services/pipeline');

const pw = (name) => process.env[name] || crypto.randomBytes(6).toString('base64url') + '#9a';

async function main() {
  await migrate();
  const d = buildCleanDataset();
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@clinic.example';
  const adminPw = pw('SEED_ADMIN_PASSWORD');
  const demoPw = pw('SEED_DEMO_PASSWORD');

  await tx(async (c) => {
    await c.query('TRUNCATE jobs, refresh_tokens, prescriptions, appointments, users, doctors, billing, lab_tests, opd_visits, admissions, patients, hospitals RESTART IDENTITY CASCADE');

    for (const h of d.hospitals) await c.query('INSERT INTO hospitals (id, name, total_beds) VALUES ($1,$2,$3)', [h.id, h.name, h.total_beds]);
    await c.query(`SELECT setval(pg_get_serial_sequence('hospitals','id'), (SELECT max(id) FROM hospitals))`);

    // Bulk inserts with unnest() - one round trip per table instead of one per row.
    await c.query(
      `INSERT INTO patients (id, name, dob, gender, phone, source_ids)
       SELECT pid, n, dob, g, ph, string_to_array(src, '|') FROM unnest($1::int[], $2::text[], $3::date[], $4::text[], $5::text[], $6::text[]) AS t(pid, n, dob, g, ph, src)`,
      [d.patients.map((p) => p.id), d.patients.map((p) => p.name), d.patients.map((p) => p.dob), d.patients.map((p) => p.gender), d.patients.map((p) => p.phone), d.patients.map((p) => p.source_ids.join('|'))]);
    await c.query(`SELECT setval(pg_get_serial_sequence('patients','id'), (SELECT max(id) FROM patients))`);

    const a = d.admissions;
    await c.query(
      `INSERT INTO admissions (hospital_id, patient_id, ward, bed_no, admit_date, discharge_date, status, diagnosis_code, diagnosis_text, flags)
       SELECT hid, pid, w, b, ad, dd, st, dc, dt, string_to_array(fl, ',') FROM unnest($1::int[],$2::int[],$3::text[],$4::text[],$5::date[],$6::date[],$7::text[],$8::text[],$9::text[],$10::text[]) AS t(hid,pid,w,b,ad,dd,st,dc,dt,fl)`,
      [a.map((x) => x.hospital_id), a.map((x) => x.patient_id), a.map((x) => x.ward), a.map((x) => x.bed_no), a.map((x) => x.admit_date), a.map((x) => x.discharge_date), a.map((x) => x.status), a.map((x) => x.diagnosis_code), a.map((x) => x.diagnosis_text), a.map((x) => x.flags.join(','))]);

    const v = d.visits;
    await c.query(`INSERT INTO opd_visits (hospital_id, patient_id, visit_date, department, complaint, diagnosis_code) SELECT * FROM unnest($1::int[],$2::int[],$3::date[],$4::text[],$5::text[],$6::text[])`,
      [v.map((x) => x.hospital_id), v.map((x) => x.patient_id), v.map((x) => x.visit_date), v.map((x) => x.department), v.map((x) => x.complaint), v.map((x) => x.diagnosis_code)]);
    const l = d.labs;
    await c.query(`INSERT INTO lab_tests (hospital_id, patient_id, test_name, test_date, result_value, unit) SELECT * FROM unnest($1::int[],$2::int[],$3::text[],$4::date[],$5::numeric[],$6::text[])`,
      [l.map((x) => x.hospital_id), l.map((x) => x.patient_id), l.map((x) => x.test_name), l.map((x) => x.test_date), l.map((x) => x.result_value), l.map((x) => x.unit)]);
    const b = d.billing;
    await c.query(`INSERT INTO billing (hospital_id, patient_id, ref_type, amount_inr, insurer_claim) SELECT * FROM unnest($1::int[],$2::int[],$3::text[],$4::numeric[],$5::boolean[])`,
      [b.map((x) => x.hospital_id), b.map((x) => x.patient_id), b.map((x) => x.ref_type), b.map((x) => x.amount_inr), b.map((x) => x.insurer_claim)]);

    // Users
    const adminHash = await bcrypt.hash(adminPw, 10);
    const demoHash = await bcrypt.hash(demoPw, 10);
    await c.query(`INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,'Platform Admin','admin')`, [adminEmail, adminHash]);
    const docs = [['Dr. Anil Mathur', 'General Medicine', 1], ['Dr. Seema Rathore', 'Cardiology', 1], ['Dr. Vikram Jain', 'Orthopaedics', 2], ['Dr. Pooja Saini', 'Paediatrics', 3]];
    for (const [i, [name, spec, hid]] of docs.entries()) {
      const r = await c.query('INSERT INTO doctors (name, specialization, hospital_id) VALUES ($1,$2,$3) RETURNING id', [name, spec, hid]);
      await c.query(`INSERT INTO users (email, password_hash, name, role, doctor_id) VALUES ($1,$2,$3,'doctor',$4)`, [`doctor${i + 1}@clinic.example`, demoHash, name, r.rows[0].id]);
    }
    await c.query(`UPDATE patients SET email='patient@clinic.example' WHERE id=1`);
    const p1 = (await c.query('SELECT id, name FROM patients WHERE id=1')).rows[0];
    await c.query(`INSERT INTO users (email, password_hash, name, role, patient_id) VALUES ('patient@clinic.example',$1,$2,'patient',$3)`, [demoHash, p1.name, p1.id]);
  });

  console.log('Seed complete:', { hospitals: d.hospitals.length, patients: d.patients.length, admissions: d.admissions.length, visits: d.visits.length, labs: d.labs.length, billing: d.billing.length });
  console.log('Data-quality report:', d.quality);
  console.log(`\nLogins (shown once):\n  admin   ${adminEmail} / ${adminPw}\n  doctors doctor1..4@clinic.example / ${demoPw}\n  patient patient@clinic.example / ${demoPw}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });

'use strict';
const router = require('express').Router();
const { query } = require('../db');
const S = require('../schemas');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const M = require('../services/metrics');

router.use(authenticate, requireRole('admin'));

const cache = new Map(); // tiny TTL cache - dashboard is read-heavy, data changes slowly
const TTL_MS = 60 * 1000;

async function compute(hospitalId) {
  const hParams = hospitalId ? [hospitalId] : [];
  const hosp = (await query(`SELECT id, name, total_beds FROM hospitals ${hospitalId ? 'WHERE id=$1' : ''} ORDER BY id`, hParams)).rows;
  const adm = (await query(`SELECT hospital_id, patient_id, admit_date, discharge_date, status FROM admissions ${hospitalId ? 'WHERE hospital_id=$1' : ''}`, hParams)).rows;
  const today = new Date().toISOString().slice(0, 10);
  const totalBeds = hosp.reduce((s, h) => s + h.total_beds, 0);
  const occ = M.bedOccupancy(adm, totalBeds, today);
  const perHospital = hosp.map((h) => {
    const rows = adm.filter((a) => a.hospital_id === h.id);
    return { id: h.id, name: h.name, totalBeds: h.total_beds, avgLengthOfStay: M.averageLengthOfStay(rows), occupancy: M.bedOccupancy(rows, h.total_beds, today).rate, readmissionRate: M.readmissionRate30(rows).rate };
  });
  const counts = (await query(`SELECT (SELECT count(*)::int FROM patients) AS patients,
                                      (SELECT count(*)::int FROM appointments WHERE status='booked' AND starts_at >= now()) AS "upcomingAppointments",
                                      (SELECT count(*)::int FROM prescriptions) AS prescriptions`)).rows[0];
  const dq = (await query(`SELECT count(*) FILTER (WHERE status='missing_discharge')::int AS "missingDischarge",
                                  count(*) FILTER (WHERE diagnosis_code IS NULL)::int AS "unmappedDiagnosis" FROM admissions ${hospitalId ? 'WHERE hospital_id=$1' : ''}`, hParams)).rows[0];
  const topDx = (await query(`SELECT coalesce(diagnosis_code,'unmapped') AS code, max(diagnosis_text) AS label, count(*)::int AS n FROM admissions
                              ${hospitalId ? 'WHERE hospital_id=$1' : ''} GROUP BY 1 ORDER BY n DESC LIMIT 6`, hParams)).rows;
  return {
    asOf: today, scope: hospitalId ? 'hospital' : 'all',
    avgLengthOfStayDays: M.averageLengthOfStay(adm),
    bedOccupancy: occ,
    readmission30: M.readmissionRate30(adm),
    perHospital, counts, dataQuality: dq, topDiagnoses: topDx,
  };
}

router.get('/dashboard', validate({ query: S.dashboardQuery }), async (req, res, next) => {
  try {
    const key = String(req.query.hospitalId || 'all');
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return res.json(hit.data);
    const data = await compute(req.query.hospitalId);
    cache.set(key, { exp: Date.now() + TTL_MS, data });
    res.json(data);
  } catch (e) { next(e); }
});

router.get('/hospitals', async (req, res, next) => {
  try { res.json({ data: (await query('SELECT id, name, total_beds AS "totalBeds" FROM hospitals ORDER BY id')).rows }); } catch (e) { next(e); }
});

router.get('/users', async (req, res, next) => {
  try { res.json({ data: (await query('SELECT id, name, email, role, created_at AS "createdAt" FROM users ORDER BY id DESC LIMIT 200')).rows }); } catch (e) { next(e); }
});
module.exports = router;

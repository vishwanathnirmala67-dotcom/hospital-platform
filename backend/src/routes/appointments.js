'use strict';
const router = require('express').Router();
const { query, tx } = require('../db');
const S = require('../schemas');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { enqueue } = require('../services/jobs');
const logger = require('../logger');

router.use(authenticate);

const BASE = `SELECT a.id, a.patient_id AS "patientId", p.name AS "patientName", a.doctor_id AS "doctorId", d.name AS "doctorName",
              d.specialization, a.starts_at AS "startsAt", a.reason, a.status, a.created_at AS "createdAt"
              FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id`;

/** Row-level access: patient -> own, doctor -> own schedule, admin -> all. */
function scope(req, where, params) {
  if (req.user.role === 'patient') { params.push(req.user.patientId); where.push(`a.patient_id=$${params.length}`); }
  if (req.user.role === 'doctor') { params.push(req.user.doctorId); where.push(`a.doctor_id=$${params.length}`); }
}

router.get('/', validate({ query: S.apptQuery }), async (req, res, next) => {
  try {
    const { status, doctorId, patientId, from, to, page, limit } = req.query;
    const where = [], params = [];
    scope(req, where, params);
    if (status) { params.push(status); where.push(`a.status=$${params.length}`); }
    if (doctorId) { params.push(doctorId); where.push(`a.doctor_id=$${params.length}`); }
    if (patientId) { params.push(patientId); where.push(`a.patient_id=$${params.length}`); }
    if (from) { params.push(from); where.push(`a.starts_at >= $${params.length}::date`); }
    if (to) { params.push(to); where.push(`a.starts_at < ($${params.length}::date + 1)`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await query(`SELECT count(*)::int n FROM appointments a ${w}`, params)).rows[0].n;
    params.push(limit, (page - 1) * limit);
    const { rows } = await query(`${BASE} ${w} ORDER BY a.starts_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ data: rows, page, limit, total });
  } catch (e) { next(e); }
});

async function loadOwned(req, id) {
  const where = ['a.id=$1'], params = [id];
  scope(req, where, params);
  const { rows } = await query(`${BASE} WHERE ${where.join(' AND ')}`, params);
  if (!rows[0]) throw new HttpError(404, 'Appointment not found'); // 404 (not 403) so IDs cannot be probed
  return rows[0];
}

router.get('/:id', validate({ params: S.idParam }), async (req, res, next) => {
  try { res.json(await loadOwned(req, req.params.id)); } catch (e) { next(e); }
});

router.post('/', validate({ body: S.apptCreate }), async (req, res, next) => {
  try {
    const b = req.body;
    if (req.user.role === 'doctor') throw new HttpError(403, 'Doctors cannot book appointments');
    const patientId = req.user.role === 'patient' ? req.user.patientId : b.patientId;
    if (!patientId) throw new HttpError(422, 'patientId is required', [{ field: 'patientId', message: 'Required' }]);
    const out = await tx(async (c) => {
      const ins = await c.query('INSERT INTO appointments (patient_id, doctor_id, starts_at, reason) VALUES ($1,$2,$3,$4) RETURNING id', [patientId, b.doctorId, b.startsAt, b.reason]);
      const info = (await c.query(`SELECT p.name, p.email, d.name AS doctor FROM patients p, doctors d WHERE p.id=$1 AND d.id=$2`, [patientId, b.doctorId])).rows[0];
      if (info?.email) await enqueue('appointment_booked', { email: info.email, name: info.name, doctor: info.doctor, when: b.startsAt }, c);
      return ins.rows[0].id;
    });
    logger.info('appointment_booked', { id: out, by: req.user.id });
    res.status(201).json(await loadOwned(req, out));
  } catch (e) { next(e); } // slot clash -> unique index -> 409 via error handler
});

router.patch('/:id', validate({ params: S.idParam, body: S.apptUpdate }), async (req, res, next) => {
  try {
    const cur = await loadOwned(req, req.params.id);
    const b = req.body;
    if (req.user.role === 'patient' && b.status && b.status !== 'cancelled') throw new HttpError(403, 'Patients can only cancel appointments');
    if (req.user.role === 'doctor' && (b.startsAt || b.reason !== undefined)) throw new HttpError(403, 'Doctors can only change the status');
    if (cur.status !== 'booked') throw new HttpError(409, `Appointment is already ${cur.status}`);
    const { rows } = await query(
      `UPDATE appointments SET status=COALESCE($1,status), starts_at=COALESCE($2,starts_at), reason=COALESCE($3,reason) WHERE id=$4 RETURNING id`,
      [b.status ?? null, b.startsAt ?? null, b.reason ?? null, req.params.id]);
    if (b.status === 'cancelled') {
      const p = (await query('SELECT name, email FROM patients WHERE id=$1', [cur.patientId])).rows[0];
      if (p?.email) await enqueue('appointment_cancelled', { email: p.email, name: p.name, when: cur.startsAt });
    }
    res.json(await loadOwned(req, rows[0].id));
  } catch (e) { next(e); }
});

router.delete('/:id', validate({ params: S.idParam }), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') throw new HttpError(403, 'Only admins can delete appointments (cancel instead)');
    const r = await query('DELETE FROM appointments WHERE id=$1', [req.params.id]);
    if (!r.rowCount) throw new HttpError(404, 'Appointment not found');
    res.status(204).end();
  } catch (e) { next(e); }
});
module.exports = router;

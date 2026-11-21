'use strict';
const router = require('express').Router();
const { query } = require('../db');
const S = require('../schemas');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');

router.use(authenticate);

/** Patients may only touch their own record; doctors/admins may read any. */
const canRead = (req, id) => req.user.role !== 'patient' || req.user.patientId === id;

router.get('/', requireRole('admin', 'doctor'), validate({ query: S.patientQuery }), async (req, res, next) => {
  try {
    const { q, gender, page, limit } = req.query;
    const where = [], params = [];
    if (q) { params.push(`%${q}%`); where.push(`(name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length})`); }
    if (gender) { params.push(gender); where.push(`gender = $${params.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await query(`SELECT count(*)::int AS n FROM patients ${w}`, params)).rows[0].n;
    params.push(limit, (page - 1) * limit);
    const { rows } = await query(`SELECT id, name, dob, gender, phone, email, created_at FROM patients ${w} ORDER BY name LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ data: rows, page, limit, total });
  } catch (e) { next(e); }
});

router.get('/:id', validate({ params: S.idParam }), async (req, res, next) => {
  try {
    if (!canRead(req, req.params.id)) throw new HttpError(403, 'You can only view your own record');
    const { rows } = await query('SELECT id, name, dob, gender, phone, email, created_at FROM patients WHERE id=$1', [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Patient not found');
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), validate({ body: S.patientCreate }), async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await query('INSERT INTO patients (name, dob, gender, phone, email) VALUES ($1,$2,$3,$4,$5) RETURNING *', [b.name, b.dob || null, b.gender, b.phone, b.email || null]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.patch('/:id', validate({ params: S.idParam, body: S.patientUpdate }), async (req, res, next) => {
  try {
    if (req.user.role === 'doctor') throw new HttpError(403, 'Doctors cannot edit patient records');
    if (!canRead(req, req.params.id)) throw new HttpError(403, 'You can only edit your own record');
    const map = { name: 'name', dob: 'dob', gender: 'gender', phone: 'phone', email: 'email' };
    const sets = [], params = [];
    for (const [k, col] of Object.entries(map)) if (req.body[k] !== undefined) { params.push(req.body[k]); sets.push(`${col}=$${params.length}`); }
    params.push(req.params.id);
    const { rows } = await query(`UPDATE patients SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`, params);
    if (!rows[0]) throw new HttpError(404, 'Patient not found');
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), validate({ params: S.idParam }), async (req, res, next) => {
  try {
    const r = await query('DELETE FROM patients WHERE id=$1', [req.params.id]);
    if (!r.rowCount) throw new HttpError(404, 'Patient not found');
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;

'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, tx } = require('../db');
const S = require('../schemas');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT d.id, d.name, d.specialization, d.hospital_id AS "hospitalId", h.name AS hospital
                                  FROM doctors d LEFT JOIN hospitals h ON h.id = d.hospital_id ORDER BY d.name`);
    res.json({ data: rows });
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), validate({ body: S.doctorCreate }), async (req, res, next) => {
  try {
    const b = req.body;
    const hash = await bcrypt.hash(b.password, 10);
    const out = await tx(async (c) => {
      const d = await c.query('INSERT INTO doctors (name, specialization, hospital_id) VALUES ($1,$2,$3) RETURNING *', [b.name, b.specialization, b.hospitalId || null]);
      await c.query(`INSERT INTO users (email, password_hash, name, role, doctor_id) VALUES ($1,$2,$3,'doctor',$4)`, [b.email, hash, b.name, d.rows[0].id]);
      return d.rows[0];
    });
    res.status(201).json(out);
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('admin'), validate({ params: S.idParam, body: S.doctorUpdate }), async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await query(
      `UPDATE doctors SET name=COALESCE($1,name), specialization=COALESCE($2,specialization), hospital_id=COALESCE($3,hospital_id) WHERE id=$4 RETURNING *`,
      [b.name ?? null, b.specialization ?? null, b.hospitalId ?? null, req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Doctor not found');
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), validate({ params: S.idParam }), async (req, res, next) => {
  try {
    await tx(async (c) => {
      await c.query('DELETE FROM users WHERE doctor_id=$1', [req.params.id]);
      const r = await c.query('DELETE FROM doctors WHERE id=$1', [req.params.id]);
      if (!r.rowCount) throw new HttpError(404, 'Doctor not found');
    });
    res.status(204).end();
  } catch (e) { next(e); }
});
module.exports = router;

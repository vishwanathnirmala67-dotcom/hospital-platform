'use strict';
const path = require('path');
const router = require('express').Router();
const { query, tx } = require('../db');
const S = require('../schemas');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { upload, uploadDir } = require('../middleware/upload');
const { enqueue } = require('../services/jobs');

router.use(authenticate);

const BASE = `SELECT r.id, r.patient_id AS "patientId", p.name AS "patientName", r.doctor_id AS "doctorId", d.name AS "doctorName",
              r.appointment_id AS "appointmentId", r.diagnosis, r.medicines, r.notes, (r.attachment IS NOT NULL) AS "hasAttachment", r.created_at AS "createdAt"
              FROM prescriptions r JOIN patients p ON p.id=r.patient_id JOIN doctors d ON d.id=r.doctor_id`;

function scope(req, where, params) {
  if (req.user.role === 'patient') { params.push(req.user.patientId); where.push(`r.patient_id=$${params.length}`); }
  if (req.user.role === 'doctor') { params.push(req.user.doctorId); where.push(`r.doctor_id=$${params.length}`); }
}
async function loadOwned(req, id, extraCols = '') {
  const where = ['r.id=$1'], params = [id];
  scope(req, where, params);
  const { rows } = await query(`${BASE.replace('r.id,', `r.id, ${extraCols}`)} WHERE ${where.join(' AND ')}`, params);
  if (!rows[0]) throw new HttpError(404, 'Prescription not found');
  return rows[0];
}

router.get('/', validate({ query: S.rxQuery }), async (req, res, next) => {
  try {
    const { q, patientId, page, limit } = req.query;
    const where = [], params = [];
    scope(req, where, params);
    if (patientId) { params.push(patientId); where.push(`r.patient_id=$${params.length}`); }
    if (q) { params.push(`%${q}%`); where.push(`(r.diagnosis ILIKE $${params.length} OR r.medicines::text ILIKE $${params.length} OR p.name ILIKE $${params.length})`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await query(`SELECT count(*)::int n FROM prescriptions r JOIN patients p ON p.id=r.patient_id ${w}`, params)).rows[0].n;
    params.push(limit, (page - 1) * limit);
    const { rows } = await query(`${BASE} ${w} ORDER BY r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ data: rows, page, limit, total });
  } catch (e) { next(e); }
});

router.get('/:id', validate({ params: S.idParam }), async (req, res, next) => {
  try { res.json(await loadOwned(req, req.params.id)); } catch (e) { next(e); }
});

router.post('/', requireRole('doctor', 'admin'), validate({ body: S.rxCreate }), async (req, res, next) => {
  try {
    const b = req.body;
    const doctorId = req.user.role === 'doctor' ? req.user.doctorId : null;
    if (!doctorId) throw new HttpError(403, 'Only doctors can issue prescriptions');
    const id = await tx(async (c) => {
      const r = await c.query(
        'INSERT INTO prescriptions (patient_id, doctor_id, appointment_id, diagnosis, medicines, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [b.patientId, doctorId, b.appointmentId || null, b.diagnosis, JSON.stringify(b.medicines), b.notes]);
      const p = (await c.query('SELECT name, email FROM patients WHERE id=$1', [b.patientId])).rows[0];
      if (p?.email) await enqueue('prescription_ready', { email: p.email, name: p.name }, c);
      return r.rows[0].id;
    });
    res.status(201).json(await loadOwned(req, id));
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('doctor'), validate({ params: S.idParam, body: S.rxUpdate }), async (req, res, next) => {
  try {
    await loadOwned(req, req.params.id); // doctor must own it
    const b = req.body;
    await query(`UPDATE prescriptions SET diagnosis=COALESCE($1,diagnosis), medicines=COALESCE($2,medicines), notes=COALESCE($3,notes) WHERE id=$4`,
      [b.diagnosis ?? null, b.medicines ? JSON.stringify(b.medicines) : null, b.notes ?? null, req.params.id]);
    res.json(await loadOwned(req, req.params.id));
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin', 'doctor'), validate({ params: S.idParam }), async (req, res, next) => {
  try {
    await loadOwned(req, req.params.id);
    await query('DELETE FROM prescriptions WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

// File / image upload (scanned prescription, lab report). Stored outside any public path; served only via the authorised GET below.
router.post('/:id/attachment', requireRole('doctor'), validate({ params: S.idParam }), (req, res, next) => {
  loadOwned(req, req.params.id).then(() => next(), next); // authorise BEFORE accepting the bytes
}, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(422, 'Attach a file in the "file" field');
    await query('UPDATE prescriptions SET attachment=$1, attachment_mime=$2 WHERE id=$3', [req.file.filename, req.file.mimetype, req.params.id]);
    res.status(201).json({ ok: true, size: req.file.size, mime: req.file.mimetype });
  } catch (e) { next(e); }
});

router.get('/:id/attachment', validate({ params: S.idParam }), async (req, res, next) => {
  try {
    const rx = await loadOwned(req, req.params.id);
    const { rows } = await query('SELECT attachment, attachment_mime FROM prescriptions WHERE id=$1', [rx.id]);
    if (!rows[0]?.attachment) throw new HttpError(404, 'No attachment');
    res.type(rows[0].attachment_mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(uploadDir, path.basename(rows[0].attachment)));
  } catch (e) { next(e); }
});
module.exports = router;

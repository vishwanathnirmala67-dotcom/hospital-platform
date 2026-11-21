'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, tx } = require('../db');
const S = require('../schemas');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { HttpError } = require('../middleware/error');
const { sha256, newRefreshToken, signAccess, refreshExpiry } = require('../services/tokens');
const logger = require('../logger');

const limiter = rateLimit({ max: process.env.NODE_ENV === 'test' ? 1000 : 20 });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, patientId: u.patient_id, doctorId: u.doctor_id });

async function issueTokens(user, client = { query }) {
  const refreshToken = newRefreshToken();
  await client.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [user.id, sha256(refreshToken), refreshExpiry()]);
  return { accessToken: signAccess(user), refreshToken, user: publicUser(user) };
}

// Public sign-up always creates a *patient*. Doctors/admins are created by an admin only (no role in the body).
router.post('/register', limiter, validate({ body: S.register }), async (req, res, next) => {
  try {
    const { name, email, password, phone, dob, gender } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const out = await tx(async (c) => {
      const p = await c.query('INSERT INTO patients (name, dob, gender, phone, email) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, dob || null, gender || 'unknown', phone || '', email]);
      const u = await c.query(`INSERT INTO users (email, password_hash, name, role, patient_id) VALUES ($1,$2,$3,'patient',$4) RETURNING *`, [email, hash, name, p.rows[0].id]);
      return issueTokens(u.rows[0], c);
    });
    logger.info('user_registered', { userId: out.user.id });
    res.status(201).json(out);
  } catch (e) { next(e); }
});

router.post('/login', limiter, validate({ body: S.login }), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE email=$1', [req.body.email]);
    const u = rows[0];
    // Same error + still do a hash compare for unknown emails -> no account enumeration / timing leak.
    const ok = await bcrypt.compare(req.body.password, u ? u.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
    if (!u || !ok) { logger.warn('login_failed', { email: req.body.email }); throw new HttpError(401, 'Incorrect email or password'); }
    logger.info('login_ok', { userId: u.id });
    res.json(await issueTokens(u));
  } catch (e) { next(e); }
});

// Rotation: each refresh token works once. Re-using an old one revokes the whole family (token theft signal).
router.post('/refresh', limiter, validate({ body: S.refresh }), async (req, res, next) => {
  try {
    const hash = sha256(req.body.refreshToken);
    const { rows } = await query('SELECT * FROM refresh_tokens WHERE token_hash=$1', [hash]);
    const t = rows[0];
    if (!t) throw new HttpError(401, 'Invalid refresh token');
    if (t.revoked_at) {
      await query('UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [t.user_id]);
      logger.warn('refresh_token_reuse', { userId: t.user_id });
      throw new HttpError(401, 'Refresh token already used; please sign in again');
    }
    if (new Date(t.expires_at) < new Date()) throw new HttpError(401, 'Refresh token expired');
    const out = await tx(async (c) => {
      await c.query('UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1', [t.id]);
      const u = await c.query('SELECT * FROM users WHERE id=$1', [t.user_id]);
      return issueTokens(u.rows[0], c);
    });
    res.json(out);
  } catch (e) { next(e); }
});

router.post('/logout', validate({ body: S.refresh }), async (req, res, next) => {
  try {
    await query('UPDATE refresh_tokens SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [sha256(req.body.refreshToken)]);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    if (!rows[0]) throw new HttpError(401, 'User no longer exists');
    res.json(publicUser(rows[0]));
  } catch (e) { next(e); }
});

module.exports = router;

'use strict';
const crypto = require('crypto');
const config = require('../config');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** Opaque random refresh token; only its hash is stored in the DB. */
const newRefreshToken = () => crypto.randomBytes(48).toString('base64url');

function signAccess(user) {
  const jwt = require('jsonwebtoken'); // lazy: keeps hashing helpers usable/testable without the dependency
  return jwt.sign({ role: user.role, patientId: user.patient_id ?? null, doctorId: user.doctor_id ?? null }, config.jwtAccessSecret, {
    subject: String(user.id), expiresIn: config.accessTtl, algorithm: 'HS256',
  });
}
const refreshExpiry = () => new Date(Date.now() + config.refreshTtlDays * 86400000);

module.exports = { sha256, newRefreshToken, signAccess, refreshExpiry };

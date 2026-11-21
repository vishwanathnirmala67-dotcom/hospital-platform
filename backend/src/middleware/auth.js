'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('./error');

function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Missing access token'));
  try {
    const p = jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'] });
    req.user = { id: p.sub, role: p.role, patientId: p.patientId ?? null, doctorId: p.doctorId ?? null };
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired access token'));
  }
}

/** requireRole('admin','doctor') */
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have access to this resource'));

module.exports = { authenticate, requireRole };

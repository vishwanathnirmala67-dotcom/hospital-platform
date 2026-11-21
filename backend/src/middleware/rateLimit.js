'use strict';
const { HttpError } = require('./error');
/** Tiny fixed-window in-memory limiter (use Redis in a multi-instance deployment - see docs/SCALING.md). */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 20 } = {}) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const h = hits.get(key) && hits.get(key).reset > now ? hits.get(key) : { n: 0, reset: now + windowMs };
    h.n += 1; hits.set(key, h);
    if (h.n > max) return next(new HttpError(429, 'Too many attempts, try again later'));
    next();
  };
}
module.exports = { rateLimit };

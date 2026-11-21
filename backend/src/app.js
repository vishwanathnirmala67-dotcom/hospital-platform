'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const logger = require('./logger');
const { notFound, errorHandler } = require('./middleware/error');
const { query } = require('./db');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy -> correct client IP for rate limiting
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: false }));
  app.use(express.json({ limit: '100kb' }));

  app.use((req, res, next) => { // request log (no bodies/headers -> no secrets)
    const t = process.hrtime.bigint();
    res.on('finish', () => logger.info('request', { method: req.method, path: req.path, status: res.statusCode, ms: Number((process.hrtime.bigint() - t) / 1000000n) }));
    next();
  });

  app.get('/health', async (req, res) => {
    try { await query('SELECT 1'); res.json({ status: 'ok' }); } catch { res.status(503).json({ status: 'db_unavailable' }); }
  });
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/patients', require('./routes/patients'));
  app.use('/api/doctors', require('./routes/doctors'));
  app.use('/api/appointments', require('./routes/appointments'));
  app.use('/api/prescriptions', require('./routes/prescriptions'));
  app.use('/api/admin', require('./routes/admin'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };

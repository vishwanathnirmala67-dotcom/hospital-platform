'use strict';
const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');
const { pool } = require('./db');
const { startWorker } = require('./services/jobs');
const { migrate } = require('../scripts/migrate');

(async () => {
  await migrate();                       // idempotent schema on every boot (simple for Render free tier)
  const server = createApp().listen(config.port, () => logger.info('server_started', { port: config.port, env: config.env }));
  const stopWorker = startWorker();
  const shutdown = (sig) => {
    logger.info('shutdown', { sig });
    stopWorker();
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})().catch((e) => { logger.error('startup_failed', { err: e.stack }); process.exit(1); });

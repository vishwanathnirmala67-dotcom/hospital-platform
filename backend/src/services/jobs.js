'use strict';
const { pool, query } = require('../db');
const config = require('../config');
const logger = require('../logger');

/** Enqueue a background job (non-blocking for the request that triggers it). */
const enqueue = (type, payload, client = { query }) =>
  client.query('INSERT INTO jobs (type, payload) VALUES ($1, $2)', [type, JSON.stringify(payload)]);

let transporter;
async function sendMail({ to, subject, text }) {
  if (!config.smtpUrl) { logger.info('email_stub', { to, subject }); return; }
  if (!transporter) transporter = require('nodemailer').createTransport(config.smtpUrl);
  await transporter.sendMail({ from: config.mailFrom, to, subject, text });
}

const handlers = {
  async appointment_booked({ email, name, when, doctor }) {
    await sendMail({ to: email, subject: 'Appointment confirmed', text: `Hi ${name}, your appointment with ${doctor} is confirmed for ${when}.` });
  },
  async appointment_cancelled({ email, name, when }) {
    await sendMail({ to: email, subject: 'Appointment cancelled', text: `Hi ${name}, your appointment on ${when} was cancelled.` });
  },
  async prescription_ready({ email, name }) {
    await sendMail({ to: email, subject: 'Your e-prescription is ready', text: `Hi ${name}, a new prescription has been added to your account.` });
  },
};

/** Claim one due job with SKIP LOCKED so several workers can run safely. Returns true if a job was processed. */
async function runOnce() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, type, payload, attempts FROM jobs WHERE status='pending' AND run_at <= now()
       ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (!rows.length) { await client.query('COMMIT'); return false; }
    const job = rows[0];
    try {
      if (!handlers[job.type]) throw new Error(`No handler for ${job.type}`);
      await handlers[job.type](job.payload);
      await client.query(`UPDATE jobs SET status='done', attempts=attempts+1 WHERE id=$1`, [job.id]);
    } catch (e) {
      const attempts = job.attempts + 1;
      const failed = attempts >= 5;
      await client.query(
        `UPDATE jobs SET attempts=$2, last_error=$3, status=$4, run_at=now() + ($5 || ' seconds')::interval WHERE id=$1`,
        [job.id, attempts, String(e.message).slice(0, 500), failed ? 'failed' : 'pending', String(2 ** attempts * 10)]);
      logger.warn('job_failed', { id: job.id, type: job.type, attempts });
    }
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('worker_error', { err: e.message });
    return false;
  } finally { client.release(); }
}

function startWorker(intervalMs = 3000) {
  const t = setInterval(async () => { while (await runOnce()); }, intervalMs);
  t.unref();
  logger.info('job_worker_started');
  return () => clearInterval(t);
}
module.exports = { enqueue, runOnce, startWorker };

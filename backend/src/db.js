'use strict';
const { Pool, types } = require('pg');
const config = require('./config');

types.setTypeParser(1082, (v) => v);          // DATE -> 'YYYY-MM-DD' string (no timezone surprises)
types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC -> number

const pool = new Pool({ connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30000 });
const query = (text, params) => pool.query(text, params);

/** Run fn(client) inside a transaction. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
module.exports = { pool, query, tx };

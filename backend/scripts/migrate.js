'use strict';
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function migrate() {
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
}
module.exports = { migrate };
if (require.main === module) migrate().then(() => { console.log('schema applied'); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });

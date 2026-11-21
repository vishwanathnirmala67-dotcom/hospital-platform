'use strict';
const config = require('./config');
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const min = LEVELS[config.logLevel] ?? 20;

// Structured JSON logs. Never pass passwords/tokens in `meta`.
const SENSITIVE = /pass(word)?|token|secret|authorization/i;
const scrub = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, SENSITIVE.test(k) ? '[redacted]' : v]));

function log(level, msg, meta) {
  if (LEVELS[level] < min) return;
  process.stdout.write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...scrub(meta) }) + '\n');
}
module.exports = {
  debug: (m, x) => log('debug', m, x),
  info: (m, x) => log('info', m, x),
  warn: (m, x) => log('warn', m, x),
  error: (m, x) => log('error', m, x),
};

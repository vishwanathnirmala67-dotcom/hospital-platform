'use strict';
const env = process.env;
const isProd = env.NODE_ENV === 'production';

const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  port: Number(env.PORT) || 4000,
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hospital',
  jwtAccessSecret: env.JWT_ACCESS_SECRET || (isProd ? '' : 'dev-only-insecure-secret'),
  accessTtl: env.ACCESS_TOKEN_TTL || '15m',
  refreshTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS) || 7,
  corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  uploadDir: env.UPLOAD_DIR || './uploads',
  smtpUrl: env.SMTP_URL || '',
  mailFrom: env.MAIL_FROM || 'no-reply@clinic.example',
  logLevel: env.LOG_LEVEL || (env.NODE_ENV === 'test' ? 'error' : 'info'),
};

// Fail fast in production if secrets are missing - never run with a default secret.
if (isProd && config.jwtAccessSecret.length < 32) {
  throw new Error('JWT_ACCESS_SECRET must be set (>= 32 chars) in production');
}
module.exports = config;

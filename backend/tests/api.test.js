'use strict';
/**
 * End-to-end API tests against a real PostgreSQL (CI provides one via a service container).
 * Skipped automatically when DATABASE_URL is not set.  Run: DATABASE_URL=... npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const HAS_DB = !!process.env.DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret-test-secret-test-secret-123';

test('API', { skip: !HAS_DB && 'DATABASE_URL not set' }, async (t) => {
  const bcrypt = require('bcryptjs');
  const { createApp } = require('../src/app');
  const { pool, query } = require('../src/db');
  const { migrate } = require('../scripts/migrate');

  await migrate();
  await query('TRUNCATE jobs, refresh_tokens, prescriptions, appointments, users, doctors, patients, hospitals RESTART IDENTITY CASCADE');
  await query(`INSERT INTO hospitals (name, total_beds) VALUES ('Test Hospital', 10)`);
  const d = (await query(`INSERT INTO doctors (name, specialization, hospital_id) VALUES ('Dr. Test','General',1) RETURNING id`)).rows[0];
  const hash = await bcrypt.hash('Passw0rdTest', 4);
  await query(`INSERT INTO users (email, password_hash, name, role) VALUES ('admin@t.co',$1,'Admin','admin')`, [hash]);
  await query(`INSERT INTO users (email, password_hash, name, role, doctor_id) VALUES ('doc@t.co',$1,'Dr. Test','doctor',$2)`, [hash, d.id]);

  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const login = async (email, password = 'Passw0rdTest') => (await call('POST', '/api/auth/login', { body: { email, password } })).body;
  const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
  t.after(async () => { server.close(); await pool.end(); });

  await t.test('health', async () => assert.equal((await call('GET', '/health')).status, 200));

  let alice, bob;
  await t.test('register creates a patient and never an admin', async () => {
    const r = await call('POST', '/api/auth/register', { body: { name: 'Alice Sharma', email: 'alice@t.co', password: 'Passw0rdTest', role: 'admin' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, 'patient');
    alice = r.body;
    bob = (await call('POST', '/api/auth/register', { body: { name: 'Bob Meena', email: 'bob@t.co', password: 'Passw0rdTest' } })).body;
    assert.equal((await call('POST', '/api/auth/register', { body: { name: 'Alice Two', email: 'alice@t.co', password: 'Passw0rdTest' } })).status, 409);
  });

  await t.test('validation returns 422 with field details', async () => {
    const r = await call('POST', '/api/auth/register', { body: { name: 'x', email: 'nope', password: '1' } });
    assert.equal(r.status, 422);
    assert.ok(r.body.error.details.length >= 2);
  });

  await t.test('login failure is generic; protected routes need a token', async () => {
    assert.equal((await call('POST', '/api/auth/login', { body: { email: 'alice@t.co', password: 'wrong-pass1' } })).status, 401);
    assert.equal((await call('GET', '/api/appointments')).status, 401);
    assert.equal((await call('GET', '/api/appointments', { token: 'garbage' })).status, 401);
  });

  await t.test('refresh rotates tokens and detects reuse', async () => {
    const first = (await login('alice@t.co')).refreshToken;
    const second = await call('POST', '/api/auth/refresh', { body: { refreshToken: first } });
    assert.equal(second.status, 200);
    assert.notEqual(second.body.refreshToken, first);
    assert.equal((await call('POST', '/api/auth/refresh', { body: { refreshToken: first } })).status, 401);   // reuse
    assert.equal((await call('POST', '/api/auth/refresh', { body: { refreshToken: second.body.refreshToken } })).status, 401); // family revoked
  });

  let apptId;
  await t.test('patient books, double-booking is rejected, cancel works', async () => {
    const when = future(3);
    const r = await call('POST', '/api/appointments', { token: alice.accessToken, body: { doctorId: d.id, startsAt: when, reason: 'Fever' } });
    assert.equal(r.status, 201);
    apptId = r.body.id;
    assert.equal((await call('POST', '/api/appointments', { token: bob.accessToken, body: { doctorId: d.id, startsAt: when } })).status, 409);
    assert.equal((await call('POST', '/api/appointments', { token: alice.accessToken, body: { doctorId: d.id, startsAt: '2020-01-01T10:00:00Z' } })).status, 422);
    const jobs = await query(`SELECT count(*)::int n FROM jobs WHERE type='appointment_booked'`);
    assert.ok(jobs.rows[0].n >= 1);
  });

  await t.test('row-level access: other patients cannot see or touch it', async () => {
    assert.equal((await call('GET', `/api/appointments/${apptId}`, { token: bob.accessToken })).status, 404);
    assert.equal((await call('PATCH', `/api/appointments/${apptId}`, { token: bob.accessToken, body: { status: 'cancelled' } })).status, 404);
    const list = await call('GET', '/api/appointments', { token: bob.accessToken });
    assert.equal(list.body.total, 0);
    assert.equal((await call('GET', `/api/patients/${alice.user.patientId}`, { token: bob.accessToken })).status, 403);
  });

  await t.test('role checks: patient cannot use admin routes', async () => {
    assert.equal((await call('GET', '/api/admin/dashboard', { token: alice.accessToken })).status, 403);
    assert.equal((await call('GET', '/api/patients', { token: alice.accessToken })).status, 403);
  });

  await t.test('doctor issues a prescription; only owner patient can read it', async () => {
    const doc = await login('doc@t.co');
    const body = { patientId: alice.user.patientId, diagnosis: 'Viral fever', medicines: [{ name: 'Paracetamol', dose: '500mg', frequency: 'TID', days: 3 }] };
    const r = await call('POST', '/api/prescriptions', { token: doc.accessToken, body });
    assert.equal(r.status, 201);
    assert.equal((await call('GET', `/api/prescriptions/${r.body.id}`, { token: alice.accessToken })).status, 200);
    assert.equal((await call('GET', `/api/prescriptions/${r.body.id}`, { token: bob.accessToken })).status, 404);
    assert.equal((await call('POST', '/api/prescriptions', { token: alice.accessToken, body })).status, 403);
    const search = await call('GET', '/api/prescriptions?q=paracetamol', { token: alice.accessToken });
    assert.equal(search.body.total, 1);
  });

  await t.test('admin searches patients with filters and sees the dashboard', async () => {
    const admin = await login('admin@t.co');
    const s = await call('GET', '/api/patients?q=alice', { token: admin.accessToken });
    assert.equal(s.status, 200);
    assert.equal(s.body.total, 1);
    const dash = await call('GET', '/api/admin/dashboard', { token: admin.accessToken });
    assert.equal(dash.status, 200);
    for (const k of ['avgLengthOfStayDays', 'bedOccupancy', 'readmission30']) assert.ok(k in dash.body);
  });

  await t.test('unknown route -> consistent 404 shape', async () => {
    const r = await call('GET', '/api/nope');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'not_found');
  });
});

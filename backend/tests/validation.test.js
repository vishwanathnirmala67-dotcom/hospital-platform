'use strict';
// Needs `zod` (installed via npm ci).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/schemas');

test('register: strong password + valid email required, email normalised', () => {
  const ok = S.register.safeParse({ name: 'Rahul Sharma', email: ' Rahul@Example.COM ', password: 'abcdefg1' });
  assert.equal(ok.success, true);
  assert.equal(ok.data.email, 'rahul@example.com');
  assert.equal(S.register.safeParse({ name: 'R', email: 'bad', password: 'short' }).success, false);
  assert.equal(S.register.safeParse({ name: 'Rahul', email: 'a@b.co', password: 'allletters' }).success, false);
});

test('register cannot smuggle a role', () => {
  const r = S.register.parse({ name: 'Eve Admin', email: 'e@x.co', password: 'abcdefg1', role: 'admin' });
  assert.equal('role' in r, false); // unknown keys are stripped
});

test('phone must be an Indian mobile number', () => {
  assert.equal(S.patientCreate.safeParse({ name: 'Ab', phone: '9829012345' }).success, true);
  assert.equal(S.patientCreate.safeParse({ name: 'Ab', phone: '12345' }).success, false);
});

test('appointment must be in the future', () => {
  const past = S.apptCreate.safeParse({ doctorId: 1, startsAt: '2020-01-01T10:00:00+05:30' });
  assert.equal(past.success, false);
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(S.apptCreate.safeParse({ doctorId: 1, startsAt: future }).success, true);
});

test('prescription needs at least one medicine', () => {
  assert.equal(S.rxCreate.safeParse({ patientId: 1, diagnosis: 'Fever', medicines: [] }).success, false);
  assert.equal(S.rxCreate.safeParse({ patientId: 1, diagnosis: 'Fever', medicines: [{ name: 'Paracetamol', dose: '500mg', frequency: 'TID', days: 3 }] }).success, true);
});

test('pagination limit is capped', () => {
  assert.equal(S.patientQuery.safeParse({ limit: '1000' }).success, false);
  assert.equal(S.patientQuery.parse({}).limit, 20);
});

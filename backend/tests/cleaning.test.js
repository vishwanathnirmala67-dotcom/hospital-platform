'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/utils/cleaning');
const { parseCsv, toCsv } = require('../src/utils/csv');

test('parseDate handles mixed Indian formats and rejects impossible dates', () => {
  assert.equal(C.parseDate('2025-03-09'), '2025-03-09');
  assert.equal(C.parseDate('09/03/2025'), '2025-03-09');
  assert.equal(C.parseDate('09-03-2025'), '2025-03-09');
  assert.equal(C.parseDate('9 Mar 2025'), '2025-03-09');
  assert.equal(C.parseDate('31/02/2025'), null);
  assert.equal(C.parseDate(''), null);
});

test('gender / phone / name normalisation', () => {
  assert.equal(C.normGender('F'), 'female');
  assert.equal(C.normGender('Male'), 'male');
  assert.equal(C.normGender(''), 'unknown');
  assert.equal(C.normPhone('+91 98290 12345'), '9829012345');
  assert.equal(C.normPhone('123'), '');
  assert.equal(C.normName('Mr.  RAHUL   Sharma'), 'rahul sharma');
});

test('mapDiagnosis maps free text to codes and keeps real codes', () => {
  assert.equal(C.mapDiagnosis('T2DM uncontrolled').code, 'E11.9');
  assert.equal(C.mapDiagnosis('high BP').code, 'I10');
  assert.equal(C.mapDiagnosis('# femur').code, 'T14.2');
  assert.deepEqual(C.mapDiagnosis('i10'), { code: 'I10', label: 'Essential hypertension', source: 'code' });
  assert.equal(C.mapDiagnosis('post op wound care').source, 'unmapped');
  assert.equal(C.mapDiagnosis('').source, 'missing');
});

test('dedupePatients merges the same person registered twice with different IDs', () => {
  const rows = [
    { hospital_id: 1, local_id: 'H1-1', name: 'Rahul Sharma', dob: '1990-01-05', gender: 'male', phone: '9829012345' },
    { hospital_id: 2, local_id: 'H2-9', name: 'MR. RAHUL  SHARMA', dob: '1990-01-05', gender: 'unknown', phone: '' },
    { hospital_id: 2, local_id: 'H2-10', name: 'Rahul Sharma', dob: '1985-07-07', gender: 'male', phone: '9111111111' }, // same name, other DOB
  ];
  const r = C.dedupePatients(rows);
  assert.equal(r.patients.length, 2);
  assert.equal(r.duplicatesMerged, 1);
  assert.equal(r.keyToPatient.get('1:H1-1'), r.keyToPatient.get('2:H2-9'));
  assert.notEqual(r.keyToPatient.get('1:H1-1'), r.keyToPatient.get('2:H2-10'));
});

test('cleanAdmission: missing discharge is open when recent, defect when old', () => {
  const recent = C.cleanAdmission({ admit_date: '10/11/2026', discharge_date: '', diagnosis: 'UTI' }, '2026-11-15');
  assert.equal(recent.status, 'admitted');
  const old = C.cleanAdmission({ admit_date: '2026-01-10', discharge_date: '', diagnosis: '' }, '2026-11-15');
  assert.equal(old.status, 'missing_discharge');
  assert.ok(old.flags.includes('missing_discharge') && old.flags.includes('diagnosis_unmapped'));
  const bad = C.cleanAdmission({ admit_date: '2026-03-10', discharge_date: '2026-03-01', diagnosis: 'UTI' }, '2026-11-15');
  assert.equal(bad.status, 'invalid');
});

test('csv round trip with quotes and commas', () => {
  const rows = [{ a: 'x,y', b: 'say "hi"' }];
  assert.deepEqual(parseCsv(toCsv(rows, ['a', 'b'])), rows);
});

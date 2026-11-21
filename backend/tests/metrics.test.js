'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/services/metrics');

const adm = (patient_id, admit_date, discharge_date, status) => ({ patient_id, admit_date, discharge_date, status });

test('average length of stay ignores open/defective stays; same-day counts as 1', () => {
  const rows = [
    adm(1, '2026-01-01', '2026-01-05', 'discharged'), // 4
    adm(2, '2026-01-01', '2026-01-01', 'discharged'), // 1
    adm(3, '2026-01-01', null, 'admitted'),
    adm(4, '2026-01-01', null, 'missing_discharge'),
  ];
  assert.equal(M.averageLengthOfStay(rows), 2.5);
  assert.equal(M.averageLengthOfStay([]), 0);
});

test('bed occupancy snapshot', () => {
  const rows = [
    adm(1, '2026-02-01', '2026-02-10', 'discharged'),
    adm(2, '2026-02-05', null, 'admitted'),
    adm(3, '2026-02-05', null, 'missing_discharge'), // excluded
    adm(4, '2026-03-01', null, 'admitted'), // future
  ];
  assert.deepEqual(M.bedOccupancy(rows, 4, '2026-02-07'), { occupied: 2, totalBeds: 4, rate: 0.5 });
  assert.equal(M.bedOccupancy(rows, 0, '2026-02-07').rate, 0);
});

test('30-day readmission rate', () => {
  const rows = [
    adm(1, '2026-01-01', '2026-01-05', 'discharged'),
    adm(1, '2026-01-20', '2026-01-25', 'discharged'), // readmit (15d) - and this is itself an index stay
    adm(2, '2026-01-01', '2026-01-05', 'discharged'),
    adm(2, '2026-03-01', '2026-03-03', 'discharged'), // 55d: not a readmission
    adm(3, '2026-01-01', '2026-01-04', 'discharged'), // no return
  ];
  const r = M.readmissionRate30(rows);
  assert.equal(r.indexStays, 5);
  assert.equal(r.readmissions, 1);
  assert.equal(r.rate, 0.2);
});

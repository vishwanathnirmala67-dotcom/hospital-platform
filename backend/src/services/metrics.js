'use strict';
const { daysBetween } = require('../utils/cleaning');
/** Pure analytics used by the admin dashboard. Rows: {patient_id, admit_date, discharge_date, status}. ISO date strings. */

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Mean days between admit and discharge, discharged stays only. Same-day stay counts as 1 day minimum. */
function averageLengthOfStay(admissions) {
  const stays = admissions
    .filter((a) => a.status === 'discharged' && a.admit_date && a.discharge_date)
    .map((a) => Math.max(1, daysBetween(a.admit_date, a.discharge_date)));
  return stays.length ? round(stays.reduce((s, x) => s + x, 0) / stays.length) : 0;
}

/** Share of beds occupied at `asOf`. Stays with missing/invalid data are excluded (cannot be placed in time). */
function bedOccupancy(admissions, totalBeds, asOf) {
  if (!totalBeds) return { occupied: 0, totalBeds: 0, rate: 0 };
  const occupied = admissions.filter((a) => {
    if (!a.admit_date || a.admit_date > asOf) return false;
    if (a.status === 'admitted') return true;
    return a.status === 'discharged' && a.discharge_date > asOf;
  }).length;
  const capped = Math.min(occupied, totalBeds);
  return { occupied: capped, totalBeds, rate: round(capped / totalBeds, 4) };
}

/** 30-day readmission: of discharged index stays, % followed by a new admission of same patient within 1..30 days. */
function readmissionRate30(admissions) {
  const byPatient = new Map();
  for (const a of admissions) {
    if (!a.admit_date || a.status === 'invalid') continue;
    if (!byPatient.has(a.patient_id)) byPatient.set(a.patient_id, []);
    byPatient.get(a.patient_id).push(a);
  }
  let index = 0, readmitted = 0;
  for (const list of byPatient.values()) {
    list.sort((x, y) => x.admit_date.localeCompare(y.admit_date));
    list.forEach((a, i) => {
      if (a.status !== 'discharged') return;
      index += 1;
      const next = list.slice(i + 1).find((b) => b.admit_date >= a.discharge_date);
      if (next && daysBetween(a.discharge_date, next.admit_date) <= 30) readmitted += 1;
    });
  }
  return { indexStays: index, readmissions: readmitted, rate: index ? round(readmitted / index, 4) : 0 };
}

/** Mean daily occupancy over the `days` ending at `asOf` (inclusive). Smooths out single-day spikes. */
function averageOccupancy(admissions, totalBeds, asOf, days = 30) {
  if (!totalBeds) return 0;
  let sum = 0;
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.parse(asOf) - i * 86400000).toISOString().slice(0, 10);
    sum += bedOccupancy(admissions, totalBeds, day).rate;
  }
  return round(sum / days, 4);
}

module.exports = { averageLengthOfStay, bedOccupancy, averageOccupancy, readmissionRate30 };

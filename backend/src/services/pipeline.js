'use strict';
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('../utils/csv');
const C = require('../utils/cleaning');

const RAW_DIR = path.join(__dirname, '..', '..', 'data', 'raw');
const read = (f) => parseCsv(fs.readFileSync(path.join(RAW_DIR, f), 'utf8'));

/** Raw CSV -> cleaned, de-duplicated dataset + a data-quality report. */
function buildCleanDataset(asOf = '2026-11-15') {
  const hospitals = read('hospitals.csv').map((h) => ({ id: +h.id, name: h.name, total_beds: +h.total_beds }));
  const rawPatients = read('patients.csv').map((r) => ({
    hospital_id: +r.hospital_id, local_id: r.local_id, name: r.name,
    dob: C.parseDate(r.dob), gender: C.normGender(r.gender), phone: C.normPhone(r.phone),
  }));
  const { patients, keyToPatient, duplicatesMerged } = C.dedupePatients(rawPatients);
  const pid = (hosp, local) => keyToPatient.get(`${hosp}:${local}`) ?? null;

  const quality = { duplicatesMerged, orphanRows: 0, missingDischarge: 0, diagnosisMappedFromText: 0, diagnosisUnmapped: 0, invalidDates: 0 };

  const admissions = [];
  for (const r of read('admissions.csv')) {
    const patient_id = pid(+r.hospital_id, r.local_patient_id);
    if (!patient_id) { quality.orphanRows++; continue; }
    const c = C.cleanAdmission(r, asOf);
    if (c.flags.includes('missing_discharge')) quality.missingDischarge++;
    if (c.flags.includes('diagnosis_mapped_from_text')) quality.diagnosisMappedFromText++;
    if (c.flags.includes('diagnosis_unmapped')) quality.diagnosisUnmapped++;
    if (c.status === 'invalid') quality.invalidDates++;
    admissions.push({ hospital_id: +r.hospital_id, patient_id, ward: r.ward, bed_no: r.bed_no, ...c });
  }
  const visits = read('opd_visits.csv').flatMap((r) => {
    const patient_id = pid(+r.hospital_id, r.local_patient_id);
    const visit_date = C.parseDate(r.visit_date);
    if (!patient_id || !visit_date) { quality.orphanRows++; return []; }
    return [{ hospital_id: +r.hospital_id, patient_id, visit_date, department: r.department, complaint: r.complaint, diagnosis_code: C.mapDiagnosis(r.complaint).code }];
  });
  const labs = read('lab_tests.csv').flatMap((r) => {
    const patient_id = pid(+r.hospital_id, r.local_patient_id);
    const test_date = C.parseDate(r.test_date);
    if (!patient_id || !test_date) { quality.orphanRows++; return []; }
    return [{ hospital_id: +r.hospital_id, patient_id, test_name: r.test_name, test_date, result_value: +r.result_value, unit: r.unit }];
  });
  const billing = read('billing.csv').flatMap((r) => {
    const patient_id = pid(+r.hospital_id, r.local_patient_id);
    if (!patient_id) { quality.orphanRows++; return []; }
    return [{ hospital_id: +r.hospital_id, patient_id, ref_type: r.ref_type, amount_inr: +r.amount_inr, insurer_claim: r.insurer_claim === 'yes' }];
  });
  return { asOf, hospitals, patients, admissions, visits, labs, billing, quality };
}
module.exports = { buildCleanDataset };

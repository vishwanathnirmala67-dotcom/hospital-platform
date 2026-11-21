'use strict';
/**
 * Generates synthetic, ANONYMISED raw exports for 4 fictional Jaipur hospitals, with deliberate mess:
 *  - diagnosis as free text (sometimes with codes), mixed date formats / gender spellings
 *  - missing discharge dates
 *  - ~6% patients registered twice with different IDs (typos, case, titles)
 * Deterministic (seeded PRNG) so tests and seeds are reproducible.
 */
const fs = require('fs');
const path = require('path');
const { toCsv } = require('../src/utils/csv');

let s = 20261121;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const HOSPITALS = [
  { id: 1, name: 'Pink City General Hospital', total_beds: 120 },
  { id: 2, name: 'Amer Heritage Hospital', total_beds: 80 },
  { id: 3, name: 'Malviya Nagar Medical Centre', total_beds: 60 },
  { id: 4, name: 'Sanganer Care Hospital', total_beds: 40 },
];
const FIRST = ['Aarav', 'Vivaan', 'Rohan', 'Kabir', 'Manish', 'Suresh', 'Ramesh', 'Anita', 'Sunita', 'Priya', 'Neha', 'Kavita', 'Meena', 'Pooja', 'Rahul', 'Deepak', 'Mohit', 'Sanjay', 'Geeta', 'Rekha'];
const LAST = ['Sharma', 'Gupta', 'Meena', 'Rathore', 'Shekhawat', 'Agarwal', 'Jain', 'Saini', 'Choudhary', 'Verma', 'Singh', 'Mathur'];
const DX_TEXT = ['Typhoid fever', 'viral fever', 'dengue +ve', 'T2DM uncontrolled', 'high BP', 'chest pain ? MI', 'pneumonia', 'asthma exacerbation', 'loose motions / vomiting', '# femur', 'acute appendicitis', 'renal calculus', 'UTI', 'tb suspect', 'post op wound care'];
const DX_CODE = ['A01.0', 'E11.9', 'I10', 'J18.9', 'K35.8', 'N20.0'];
const LABS = ['CBC', 'HbA1c', 'Lipid profile', 'Creatinine', 'LFT', 'Dengue NS1', 'Widal', 'Urine routine'];
const WARDS = ['General', 'ICU', 'Maternity', 'Surgical', 'Paediatric'];

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => d.toISOString().slice(0, 10);
function fmtDate(d) {
  const r = rnd();
  const [y, m, dd] = isoDate(d).split('-');
  if (r < 0.55) return `${y}-${m}-${dd}`;
  if (r < 0.9) return `${dd}/${m}/${y}`;
  return `${dd}-${m}-${y}`;
}
const AS_OF = new Date(Date.UTC(2026, 10, 15));
const daysAgo = (n) => new Date(AS_OF.getTime() - n * 86400000);

const patients = [], visits = [], admissions = [], labs = [], billing = [];
const base = []; // real people
for (let i = 0; i < 420; i++) {
  base.push({
    name: `${pick(FIRST)} ${pick(LAST)}`,
    dob: new Date(Date.UTC(int(1940, 2020), int(0, 11), int(1, 28))),
    gender: pick(['M', 'F', 'Male', 'Female', 'm', 'f']),
    phone: `9${int(100000000, 999999999)}`,
  });
}
const localCounter = {};
function register(person, hospital, messy) {
  localCounter[hospital] = (localCounter[hospital] || 0) + 1;
  const local = `H${hospital}-${String(localCounter[hospital]).padStart(5, '0')}`;
  let name = person.name;
  if (messy) {
    const v = rnd();
    if (v < 0.3) name = name.toUpperCase();
    else if (v < 0.55) name = `Mr. ${name}`;
    else if (v < 0.8) name = name.replace('a', 'aa');
    else name = name.replace(' ', '  ');
  }
  patients.push({ hospital_id: hospital, local_id: local, name, dob: fmtDate(person.dob), gender: person.gender, phone: rnd() < 0.15 ? '' : (rnd() < 0.5 ? `+91 ${person.phone}` : person.phone) });
  return local;
}
const regs = []; // {hospital, local}
base.forEach((p, i) => {
  const h = 1 + (i % 4);
  regs.push({ p, hospital: h, local: register(p, h, false) });
  if (rnd() < 0.06) { // registered a second time elsewhere
    const h2 = 1 + ((h + int(0, 2)) % 4);
    regs.push({ p, hospital: h2, local: register(p, h2, true) });
  }
});

let visitId = 0, admId = 0, labId = 0, billId = 0;
for (const r of regs) {
  const nVisits = int(1, 5);
  for (let v = 0; v < nVisits; v++) {
    const d = daysAgo(int(1, 400));
    visitId++;
    visits.push({ visit_id: `V${visitId}`, hospital_id: r.hospital, local_patient_id: r.local, visit_date: fmtDate(d), department: pick(['General Medicine', 'Orthopaedics', 'Paediatrics', 'Cardiology', 'ENT', 'Gynaecology']), complaint: pick(DX_TEXT) });
    billId++;
    billing.push({ bill_id: `B${billId}`, hospital_id: r.hospital, local_patient_id: r.local, ref_type: 'OPD', ref_id: `V${visitId}`, amount_inr: int(200, 1500), insurer_claim: rnd() < 0.6 ? 'yes' : 'no' });
  }
  const nAdm = rnd() < 0.55 ? 0 : rnd() < 0.8 ? 1 : 2;
  let cursor = 400;
  for (let a = 0; a < nAdm; a++) {
    cursor -= int(20, 150); // spacing allows some 30-day readmissions
    if (cursor < 2) break;
    const los = int(1, 12);
    const admit = daysAgo(cursor);
    const discharge = new Date(admit.getTime() + los * 86400000);
    admId++;
    const rr = rnd();
    admissions.push({
      admission_id: `A${admId}`, hospital_id: r.hospital, local_patient_id: r.local, ward: pick(WARDS), bed_no: `${pick(['A', 'B', 'C'])}-${int(1, 40)}`,
      admit_date: fmtDate(admit),
      discharge_date: rr < 0.07 ? '' : fmtDate(discharge),
      diagnosis: rnd() < 0.7 ? pick(DX_TEXT) : pick(DX_CODE),
    });
    if (rnd() < 0.2 && cursor > 40) { // quick readmission
      admId++;
      const re = new Date(discharge.getTime() + int(3, 25) * 86400000);
      if (re < AS_OF) admissions.push({ admission_id: `A${admId}`, hospital_id: r.hospital, local_patient_id: r.local, ward: pick(WARDS), bed_no: `${pick(['A', 'B', 'C'])}-${int(1, 40)}`, admit_date: fmtDate(re), discharge_date: fmtDate(new Date(re.getTime() + int(1, 6) * 86400000)), diagnosis: pick(DX_TEXT) });
    }
    billId++;
    billing.push({ bill_id: `B${billId}`, hospital_id: r.hospital, local_patient_id: r.local, ref_type: 'IPD', ref_id: `A${admId}`, amount_inr: int(8000, 180000), insurer_claim: 'yes' });
  }
  if (rnd() < 0.5) {
    labId++;
    labs.push({ lab_id: `L${labId}`, hospital_id: r.hospital, local_patient_id: r.local, test_name: pick(LABS), test_date: fmtDate(daysAgo(int(1, 300))), result_value: (rnd() * 100).toFixed(1), unit: pick(['mg/dL', 'g/dL', '%', 'U/L']) });
  }
}

// Patients currently in hospital (no discharge date yet) so occupancy is meaningful.
for (const h of HOSPITALS) {
  const hostRegs = regs.filter((r) => r.hospital === h.id);
  const n = Math.round(h.total_beds * (0.55 + rnd() * 0.3));
  for (let k = 0; k < n && k < hostRegs.length; k++) {
    const r = hostRegs[(k * 7) % hostRegs.length];
    admId++;
    admissions.push({ admission_id: `A${admId}`, hospital_id: r.hospital, local_patient_id: r.local, ward: pick(WARDS), bed_no: `${pick(['A', 'B', 'C'])}-${int(1, 40)}`, admit_date: fmtDate(daysAgo(int(0, 12))), discharge_date: '', diagnosis: pick(DX_TEXT) });
  }
}

const out = path.join(__dirname, '..', 'data', 'raw');
fs.mkdirSync(out, { recursive: true });
const write = (f, rows, cols) => fs.writeFileSync(path.join(out, f), toCsv(rows, cols));
write('hospitals.csv', HOSPITALS, ['id', 'name', 'total_beds']);
write('patients.csv', patients, ['hospital_id', 'local_id', 'name', 'dob', 'gender', 'phone']);
write('opd_visits.csv', visits, ['visit_id', 'hospital_id', 'local_patient_id', 'visit_date', 'department', 'complaint']);
write('admissions.csv', admissions, ['admission_id', 'hospital_id', 'local_patient_id', 'ward', 'bed_no', 'admit_date', 'discharge_date', 'diagnosis']);
write('lab_tests.csv', labs, ['lab_id', 'hospital_id', 'local_patient_id', 'test_name', 'test_date', 'result_value', 'unit']);
write('billing.csv', billing, ['bill_id', 'hospital_id', 'local_patient_id', 'ref_type', 'ref_id', 'amount_inr', 'insurer_claim']);
console.log(`raw: patients=${patients.length} visits=${visits.length} admissions=${admissions.length} labs=${labs.length} billing=${billing.length}`);

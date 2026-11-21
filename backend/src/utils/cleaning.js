'use strict';
/**
 * Pure data-cleaning helpers for the messy hospital exports.
 * Handles: mixed date formats, free-text diagnoses, missing discharge dates,
 * and patients registered twice under different IDs.
 */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function iso(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, "12 Mar 2025". Returns ISO date or null. */
function parseDate(input) {
  if (!input) return null;
  const s = String(input).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) return iso(+m[3], +m[2], +m[1]); // Indian: day first
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,4})[a-z]*\.?,?\s+(\d{4})$/))) {
    const mon = MONTHS[m[2].toLowerCase()];
    return mon ? iso(+m[3], mon, +m[1]) : null;
  }
  return null;
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
}

function normGender(g) {
  const s = String(g || '').trim().toLowerCase();
  if (['m', 'male', 'man'].includes(s)) return 'male';
  if (['f', 'female', 'woman'].includes(s)) return 'female';
  if (!s) return 'unknown';
  return 'other';
}

function normPhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

function normName(n) {
  return String(n || '')
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|shri|smt|late)\b\.?/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// ---- Diagnosis: free text -> ICD-10 style code -------------------------------------------
const DIAGNOSIS_RULES = [
  [/(typhoid|enteric)/i, 'A01.0', 'Typhoid fever'],
  [/(dengue)/i, 'A90', 'Dengue fever'],
  [/(malaria)/i, 'B54', 'Malaria'],
  [/(tb|tuberc)/i, 'A15.9', 'Tuberculosis'],
  [/(diabet|dm2|t2dm|sugar)/i, 'E11.9', 'Type 2 diabetes mellitus'],
  [/(hypertens|high bp|htn|b\.?p\.? high)/i, 'I10', 'Essential hypertension'],
  [/(heart attack|myocard|mi\b|chest pain)/i, 'I21.9', 'Acute myocardial infarction'],
  [/(pneumon|chest infection)/i, 'J18.9', 'Pneumonia'],
  [/(asthma|wheez)/i, 'J45.9', 'Asthma'],
  [/(gastro|loose motion|diarrh|vomit)/i, 'A09', 'Gastroenteritis'],
  [/(fracture|# ?(femur|radius|tibia)|broken)/i, 'T14.2', 'Fracture'],
  [/(appendic)/i, 'K35.8', 'Appendicitis'],
  [/(kidney stone|renal calc|urolith)/i, 'N20.0', 'Kidney stone'],
  [/(uti|urinary infect)/i, 'N39.0', 'Urinary tract infection'],
  [/(fever|viral|flu)/i, 'R50.9', 'Fever, unspecified'],
];
const CODE_LABELS = Object.fromEntries(DIAGNOSIS_RULES.map(([, code, label]) => [code, label]));
const ICD_RE = /^[A-TV-Z]\d{2}(\.\d{1,2})?$/i;

/** @returns {{code:string|null,label:string,source:'code'|'text'|'unmapped'|'missing'}} */
function mapDiagnosis(text) {
  const s = String(text || '').trim();
  if (!s) return { code: null, label: '', source: 'missing' };
  if (ICD_RE.test(s)) { const code = s.toUpperCase(); return { code, label: CODE_LABELS[code] || code, source: 'code' }; }
  for (const [re, code, label] of DIAGNOSIS_RULES) if (re.test(s)) return { code, label, source: 'text' };
  return { code: null, label: s, source: 'unmapped' };
}

// ---- Duplicate patients ------------------------------------------------------------------
/**
 * Merge patients registered more than once (different hospital IDs).
 * Two records match when DOB is equal AND (name equal OR phone equal OR names within edit distance 2).
 * @param {Array<{hospital_id:number,local_id:string,name:string,dob:string|null,phone:string}>} rows
 * @returns {{patients:Array,keyToPatient:Map<string,number>,duplicatesMerged:number}}
 */
function dedupePatients(rows) {
  const parent = rows.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { parent[find(a)] = find(b); };
  const byDob = new Map();
  rows.forEach((r, i) => {
    if (!r.dob) return;
    if (!byDob.has(r.dob)) byDob.set(r.dob, []);
    byDob.get(r.dob).push(i);
  });
  for (const idxs of byDob.values()) {
    for (let a = 0; a < idxs.length; a++)
      for (let b = a + 1; b < idxs.length; b++) {
        const A = rows[idxs[a]], B = rows[idxs[b]];
        const na = normName(A.name), nb = normName(B.name);
        const samePhone = A.phone && A.phone === B.phone;
        if (na === nb || samePhone || levenshtein(na, nb) <= 2) union(idxs[a], idxs[b]);
      }
  }
  const groups = new Map();
  rows.forEach((r, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(r);
  });
  const patients = [];
  const keyToPatient = new Map();
  let n = 0;
  for (const members of groups.values()) {
    n += 1;
    const best = members.reduce((a, b) => (b.name.length > a.name.length ? b : a));
    patients.push({
      id: n,
      name: best.name.trim().replace(/\s+/g, ' '),
      dob: members.find((m) => m.dob)?.dob ?? null,
      gender: members.map((m) => m.gender).find((g) => g && g !== 'unknown') || 'unknown',
      phone: members.map((m) => m.phone).find(Boolean) || '',
      source_ids: members.map((m) => `${m.hospital_id}:${m.local_id}`),
    });
    for (const m of members) keyToPatient.set(`${m.hospital_id}:${m.local_id}`, n);
  }
  return { patients, keyToPatient, duplicatesMerged: rows.length - patients.length };
}

// ---- Admissions --------------------------------------------------------------------------
/**
 * Normalises one admission. Missing discharge:
 *  - admitted within `openWindowDays` of asOf  => still in hospital ('admitted')
 *  - older                                      => data defect ('missing_discharge'), excluded from LOS
 */
function cleanAdmission(raw, asOf, openWindowDays = 45) {
  const admit = parseDate(raw.admit_date);
  const discharge = parseDate(raw.discharge_date);
  const flags = [];
  let status;
  if (!admit) { flags.push('bad_admit_date'); status = 'invalid'; }
  else if (!discharge) {
    if (daysBetween(admit, asOf) <= openWindowDays) status = 'admitted';
    else { status = 'missing_discharge'; flags.push('missing_discharge'); }
  } else if (daysBetween(admit, discharge) < 0) { status = 'invalid'; flags.push('discharge_before_admit'); }
  else status = 'discharged';
  const dx = mapDiagnosis(raw.diagnosis);
  if (dx.source === 'text') flags.push('diagnosis_mapped_from_text');
  if (dx.source === 'unmapped' || dx.source === 'missing') flags.push('diagnosis_unmapped');
  return { admit_date: admit, discharge_date: status === 'discharged' ? discharge : null, status, diagnosis_code: dx.code, diagnosis_text: dx.label, flags };
}

module.exports = { parseDate, daysBetween, normGender, normPhone, normName, levenshtein, mapDiagnosis, dedupePatients, cleanAdmission };

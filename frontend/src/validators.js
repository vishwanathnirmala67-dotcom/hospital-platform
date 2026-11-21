// Client-side validation. Mirrors backend/src/schemas.js - the server is still the source of truth.
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || '');
export const isPhone = (s) => /^(\+91[\s-]?)?[6-9]\d{9}$/.test((s || '').trim());

export function validateRegister(f) {
  const e = {};
  if (!f.name || f.name.trim().length < 2) e.name = 'Enter your full name';
  if (!isEmail(f.email)) e.email = 'Enter a valid email';
  if (!f.password || f.password.length < 8) e.password = 'At least 8 characters';
  else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'Use letters and at least one digit';
  if (f.phone && !isPhone(f.phone)) e.phone = 'Enter a valid 10-digit mobile number';
  return e;
}
export function validateLogin(f) {
  const e = {};
  if (!isEmail(f.email)) e.email = 'Enter a valid email';
  if (!f.password) e.password = 'Enter your password';
  return e;
}
export function validateAppointment(f) {
  const e = {};
  if (!f.doctorId) e.doctorId = 'Choose a doctor';
  if (!f.startsAt) e.startsAt = 'Pick a date and time';
  else if (new Date(f.startsAt) <= new Date()) e.startsAt = 'Time must be in the future';
  return e;
}
export function validatePrescription(f) {
  const e = {};
  if (!f.patientId) e.patientId = 'Choose a patient';
  if (!f.diagnosis || f.diagnosis.trim().length < 2) e.diagnosis = 'Enter a diagnosis';
  if (!f.medicines.length || f.medicines.some((m) => !m.name.trim() || !(Number(m.days) >= 1))) e.medicines = 'Each medicine needs a name and number of days';
  return e;
}

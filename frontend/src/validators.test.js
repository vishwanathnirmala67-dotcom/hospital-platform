import { describe, it, expect } from 'vitest';
import { validateRegister, validateLogin, validateAppointment, validatePrescription } from './validators.js';

describe('validators', () => {
  it('flags a weak registration', () => {
    const e = validateRegister({ name: 'R', email: 'x', password: 'abc' });
    expect(Object.keys(e)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
  it('accepts a good registration', () => {
    expect(validateRegister({ name: 'Rahul Sharma', email: 'r@x.co', password: 'abcdefg1', phone: '9829012345' })).toEqual({});
  });
  it('login needs both fields', () => expect(Object.keys(validateLogin({ email: '', password: '' })).length).toBe(2));
  it('appointment must be in the future', () => {
    expect(validateAppointment({ doctorId: '1', startsAt: '2020-01-01T10:00' }).startsAt).toBeTruthy();
    expect(validateAppointment({ doctorId: '1', startsAt: new Date(Date.now() + 864e5).toISOString() })).toEqual({});
  });
  it('prescription needs a medicine', () => {
    expect(validatePrescription({ patientId: 1, diagnosis: 'Fever', medicines: [] }).medicines).toBeTruthy();
  });
});

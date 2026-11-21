'use strict';
const { z } = require('zod');

const id = z.coerce.number().int().positive();
const page = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');
const phone = z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');
const password = z.string().min(8, 'At least 8 characters').max(72).regex(/[A-Za-z]/, 'Must contain a letter').regex(/\d/, 'Must contain a digit');

const schemas = {
  idParam: z.object({ id }),
  register: z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(200),
    password,
    phone: phone.optional(),
    dob: isoDate.optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
  }),
  login: z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) }),
  refresh: z.object({ refreshToken: z.string().min(20).max(200) }),

  patientCreate: z.object({
    name: z.string().trim().min(2).max(100),
    dob: isoDate.optional(),
    gender: z.enum(['male', 'female', 'other', 'unknown']).default('unknown'),
    phone: phone.optional().default(''),
    email: z.string().trim().toLowerCase().email().optional(),
  }),
  patientUpdate: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    dob: isoDate.optional(),
    gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
    phone: phone.optional(),
    email: z.string().trim().toLowerCase().email().optional(),
  }).refine((o) => Object.keys(o).length > 0, 'Nothing to update'),
  patientQuery: z.object({ q: z.string().trim().max(100).optional(), gender: z.enum(['male', 'female', 'other', 'unknown']).optional(), ...page }),

  doctorCreate: z.object({
    name: z.string().trim().min(2).max(100),
    specialization: z.string().trim().min(2).max(100),
    hospitalId: id.optional(),
    email: z.string().trim().toLowerCase().email(),
    password,
  }),
  doctorUpdate: z.object({ name: z.string().trim().min(2).max(100).optional(), specialization: z.string().trim().min(2).max(100).optional(), hospitalId: id.optional() }).refine((o) => Object.keys(o).length > 0, 'Nothing to update'),

  apptCreate: z.object({
    patientId: id.optional(),               // ignored for patients (forced to self)
    doctorId: id,
    startsAt: z.string().datetime({ offset: true }).refine((s) => new Date(s) > new Date(), 'Must be in the future'),
    reason: z.string().trim().max(500).default(''),
  }),
  apptUpdate: z.object({
    status: z.enum(['booked', 'completed', 'cancelled']).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    reason: z.string().trim().max(500).optional(),
  }).refine((o) => Object.keys(o).length > 0, 'Nothing to update'),
  apptQuery: z.object({
    status: z.enum(['booked', 'completed', 'cancelled']).optional(),
    doctorId: id.optional(), patientId: id.optional(),
    from: isoDate.optional(), to: isoDate.optional(), ...page,
  }),

  medicine: z.object({ name: z.string().trim().min(1).max(100), dose: z.string().trim().max(50), frequency: z.string().trim().max(50), days: z.coerce.number().int().min(1).max(365) }),
  rxQuery: z.object({ q: z.string().trim().max(100).optional(), patientId: id.optional(), ...page }),
  dashboardQuery: z.object({ hospitalId: id.optional() }),
};
schemas.rxCreate = z.object({
  patientId: id,
  appointmentId: id.optional(),
  diagnosis: z.string().trim().min(2).max(300),
  medicines: z.array(schemas.medicine).min(1, 'Add at least one medicine').max(20),
  notes: z.string().trim().max(1000).default(''),
});
schemas.rxUpdate = z.object({
  diagnosis: z.string().trim().min(2).max(300).optional(),
  medicines: z.array(schemas.medicine).min(1).max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
}).refine((o) => Object.keys(o).length > 0, 'Nothing to update');

module.exports = schemas;

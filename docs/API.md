# API reference

Base URL: `http://localhost:4000` · JSON in/out · `Authorization: Bearer <accessToken>` on everything except `/health` and `/api/auth/*`.

**Error shape (all endpoints):** `{ "error": { "code": "validation_error", "message": "Validation failed", "details": [{"field":"email","message":"Invalid email"}] } }`
Codes: `bad_request 400` · `unauthorized 401` · `forbidden 403` · `not_found 404` · `conflict 409` · `file_too_large 413` · `validation_error 422` · `rate_limited 429` · `internal_error 500`.

**Pagination:** `?page=1&limit=20` (limit ≤ 100) → `{ data: [...], page, limit, total }`.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | `name, email, password, phone?, dob?, gender?` | Creates a **patient**. 201 → `{accessToken, refreshToken, user}` |
| POST | `/api/auth/login` | `email, password` | 200 → tokens. 401 generic message |
| POST | `/api/auth/refresh` | `refreshToken` | Rotates: old token is revoked; reusing it revokes the whole session family |
| POST | `/api/auth/logout` | `refreshToken` | 204 |
| GET | `/api/auth/me` | – | current user |

## Patients  (`admin`,`doctor` list; patient only self)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/patients?q=&gender=&page=&limit=` | admin, doctor | search name/phone/email |
| GET | `/api/patients/:id` | admin, doctor, own patient | |
| POST | `/api/patients` | admin | |
| PATCH | `/api/patients/:id` | admin, own patient | |
| DELETE | `/api/patients/:id` | admin | cascades |

## Doctors
| GET | `/api/doctors` | any | list |
|---|---|---|---|
| POST | `/api/doctors` | admin | `name, specialization, hospitalId?, email, password` – also creates the doctor login |
| PATCH / DELETE | `/api/doctors/:id` | admin | |

## Appointments
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/appointments?status=&doctorId=&patientId=&from=&to=` | all (row-scoped) | patient → own, doctor → own schedule |
| GET | `/api/appointments/:id` | owner/admin | 404 if not yours |
| POST | `/api/appointments` | patient, admin | `doctorId, startsAt (ISO, future), reason?, patientId (admin only)`. **409** if the doctor's slot is taken. Queues a confirmation email |
| PATCH | `/api/appointments/:id` | patient (cancel only), doctor (status only), admin | |
| DELETE | `/api/appointments/:id` | admin | |

## Prescriptions
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/prescriptions?q=&patientId=` | all (row-scoped) | search diagnosis / medicine / patient |
| GET | `/api/prescriptions/:id` | owner patient, issuing doctor, admin | |
| POST | `/api/prescriptions` | doctor | `patientId, diagnosis, medicines[{name,dose,frequency,days}], notes?, appointmentId?` |
| PATCH / DELETE | `/api/prescriptions/:id` | issuing doctor (PATCH); doctor/admin (DELETE) | |
| POST | `/api/prescriptions/:id/attachment` | issuing doctor | multipart field `file`; PDF/PNG/JPEG ≤ 5 MB |
| GET | `/api/prescriptions/:id/attachment` | owner patient, doctor, admin | streams the file |

## Admin
| GET | `/api/admin/dashboard?hospitalId=` | admin | `avgLengthOfStayDays, bedOccupancy{occupied,totalBeds,rate}, readmission30{indexStays,readmissions,rate}, perHospital[], counts, dataQuality, topDiagnoses[]` (60 s cache) |
|---|---|---|---|
| GET | `/api/admin/hospitals` · `/api/admin/users` | admin | |

## Health
`GET /health` → `{status:"ok"}` (503 if DB unreachable)

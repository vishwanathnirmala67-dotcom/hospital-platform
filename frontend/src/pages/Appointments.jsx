import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { validateAppointment } from '../validators.js';
import { Field, Alert, Pager, errorInfo, fmt } from '../components/ui.jsx';

export default function Appointments() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ status: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ data: [], total: 0, limit: 20 });
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState({ doctorId: '', startsAt: '', reason: '', patientId: '' });
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState({ kind: 'error', text: '' });
  const limit = 20;

  const load = useCallback(() => {
    api('/api/appointments' + qs({ ...filters, page, limit })).then(setList).catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, [filters, page]);
  useEffect(load, [load]);
  useEffect(() => { api('/api/doctors').then((d) => setDoctors(d.data)).catch(() => {}); }, []);

  const book = async (e) => {
    e.preventDefault();
    const v = validateAppointment(form);
    if (user.role === 'admin' && !form.patientId) v.patientId = 'Enter the patient ID';
    setErrs(v); setMsg({ kind: 'error', text: '' });
    if (Object.keys(v).length) return;
    try {
      await api('/api/appointments', { method: 'POST', body: { doctorId: Number(form.doctorId), startsAt: new Date(form.startsAt).toISOString(), reason: form.reason, ...(form.patientId ? { patientId: Number(form.patientId) } : {}) } });
      setForm({ doctorId: '', startsAt: '', reason: '', patientId: '' });
      setMsg({ kind: 'ok', text: 'Appointment booked. A confirmation email is on its way.' });
      setPage(1); load();
    } catch (err) { const i = errorInfo(err); setErrs(i.fields); setMsg({ kind: 'error', text: i.message }); }
  };
  const setStatus = async (id, status) => {
    try { await api(`/api/appointments/${id}`, { method: 'PATCH', body: { status } }); load(); }
    catch (err) { setMsg({ kind: 'error', text: err.message }); }
  };
  const canBook = user.role !== 'doctor';

  return (
    <>
      <h1>Appointments</h1>
      <Alert kind={msg.kind}>{msg.text}</Alert>
      {canBook && (
        <form className="card grid" onSubmit={book} noValidate>
          <h2>Book an appointment</h2>
          {user.role === 'admin' && <Field label="Patient ID" error={errs.patientId}><input value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} inputMode="numeric" /></Field>}
          <Field label="Doctor" error={errs.doctorId}>
            <select value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
              <option value="">Select…</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialization}</option>)}
            </select>
          </Field>
          <Field label="Date & time" error={errs.startsAt}><input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></Field>
          <Field label="Reason" error={errs.reason}><input value={form.reason} maxLength={500} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          <button type="submit">Book</button>
        </form>
      )}
      <div className="card">
        <div className="filters">
          <select aria-label="Status" value={filters.status} onChange={(e) => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}>
            <option value="">All statuses</option><option value="booked">Booked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </select>
          <input aria-label="From" type="date" value={filters.from} onChange={(e) => { setPage(1); setFilters({ ...filters, from: e.target.value }); }} />
          <input aria-label="To" type="date" value={filters.to} onChange={(e) => { setPage(1); setFilters({ ...filters, to: e.target.value }); }} />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Patient</th><th>Doctor</th><th>Reason</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.data.map((a) => (
                <tr key={a.id}>
                  <td>{fmt(a.startsAt)}</td><td>{a.patientName}</td><td>{a.doctorName}<br /><small className="muted">{a.specialization}</small></td><td>{a.reason || '—'}</td>
                  <td><span className={`pill ${a.status}`}>{a.status}</span></td>
                  <td className="actions">
                    {a.status === 'booked' && user.role === 'doctor' && <button className="ghost" onClick={() => setStatus(a.id, 'completed')}>Complete</button>}
                    {a.status === 'booked' && <button className="ghost danger" onClick={() => window.confirm('Cancel this appointment?') && setStatus(a.id, 'cancelled')}>Cancel</button>}
                  </td>
                </tr>
              ))}
              {!list.data.length && <tr><td colSpan="6" className="muted center">No appointments found</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} limit={limit} total={list.total} onChange={setPage} />
      </div>
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { validatePrescription } from '../validators.js';
import { Field, Alert, Pager, errorInfo, fmt } from '../components/ui.jsx';

const blank = { patientId: '', diagnosis: '', notes: '', medicines: [{ name: '', dose: '', frequency: '', days: 3 }] };
const MAX_BYTES = 5 * 1024 * 1024;

export default function Prescriptions() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ data: [], total: 0 });
  const [form, setForm] = useState(blank);
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState({ kind: 'error', text: '' });
  const limit = 10;

  const load = useCallback(() => { api('/api/prescriptions' + qs({ q, page, limit })).then(setList).catch((e) => setMsg({ kind: 'error', text: e.message })); }, [q, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const setMed = (i, k, v) => setForm({ ...form, medicines: form.medicines.map((m, j) => (j === i ? { ...m, [k]: v } : m)) });
  const create = async (e) => {
    e.preventDefault();
    const v = validatePrescription(form); setErrs(v); setMsg({ kind: 'error', text: '' });
    if (Object.keys(v).length) return;
    try {
      await api('/api/prescriptions', { method: 'POST', body: { patientId: Number(form.patientId), diagnosis: form.diagnosis, notes: form.notes, medicines: form.medicines.map((m) => ({ ...m, days: Number(m.days) })) } });
      setForm(blank); setMsg({ kind: 'ok', text: 'Prescription issued.' }); load();
    } catch (err) { const i = errorInfo(err); setErrs(i.fields); setMsg({ kind: 'error', text: i.message }); }
  };
  const upload = async (id, file) => {
    if (!file) return;
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) return setMsg({ kind: 'error', text: 'Only PDF, PNG or JPEG files are allowed' });
    if (file.size > MAX_BYTES) return setMsg({ kind: 'error', text: 'File is larger than 5 MB' });
    const fd = new FormData(); fd.append('file', file);
    try { await api(`/api/prescriptions/${id}/attachment`, { method: 'POST', form: fd }); setMsg({ kind: 'ok', text: 'Attachment uploaded.' }); load(); }
    catch (err) { setMsg({ kind: 'error', text: err.message }); }
  };
  const download = async (id) => { // auth header required, so fetch as blob then open
    try { const blob = await api(`/api/prescriptions/${id}/attachment`); window.open(URL.createObjectURL(blob), '_blank', 'noopener'); }
    catch (err) { setMsg({ kind: 'error', text: err.message }); }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this prescription?')) return;
    try { await api(`/api/prescriptions/${id}`, { method: 'DELETE' }); load(); } catch (err) { setMsg({ kind: 'error', text: err.message }); }
  };

  return (
    <>
      <h1>Prescriptions</h1>
      <Alert kind={msg.kind}>{msg.text}</Alert>
      {user.role === 'doctor' && (
        <form className="card" onSubmit={create} noValidate>
          <h2>Issue e-prescription</h2>
          <div className="grid">
            <Field label="Patient ID" error={errs.patientId}><input inputMode="numeric" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} /></Field>
            <Field label="Diagnosis" error={errs.diagnosis}><input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} /></Field>
          </div>
          {form.medicines.map((m, i) => (
            <div className="grid med" key={i}>
              <input placeholder="Medicine" aria-label="Medicine" value={m.name} onChange={(e) => setMed(i, 'name', e.target.value)} />
              <input placeholder="Dose (500 mg)" aria-label="Dose" value={m.dose} onChange={(e) => setMed(i, 'dose', e.target.value)} />
              <input placeholder="Frequency (1-0-1)" aria-label="Frequency" value={m.frequency} onChange={(e) => setMed(i, 'frequency', e.target.value)} />
              <input type="number" min="1" max="365" aria-label="Days" value={m.days} onChange={(e) => setMed(i, 'days', e.target.value)} />
              <button type="button" className="ghost danger" disabled={form.medicines.length === 1} onClick={() => setForm({ ...form, medicines: form.medicines.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          {errs.medicines && <em className="err">{errs.medicines}</em>}
          <p><button type="button" className="ghost" onClick={() => setForm({ ...form, medicines: [...form.medicines, { name: '', dose: '', frequency: '', days: 3 }] })}>+ Add medicine</button></p>
          <Field label="Notes"><textarea rows="2" maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <button type="submit">Issue prescription</button>
        </form>
      )}
      <div className="card">
        <div className="filters"><input placeholder="Search diagnosis, medicine or patient…" aria-label="Search" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} /></div>
        {list.data.map((r) => (
          <article className="rx" key={r.id}>
            <header><strong>{r.diagnosis}</strong><span className="muted"> · {r.patientName} · by {r.doctorName} · {fmt(r.createdAt)}</span></header>
            <ul>{r.medicines.map((m, i) => <li key={i}>{m.name} {m.dose} — {m.frequency} × {m.days} day(s)</li>)}</ul>
            {r.notes && <p className="muted">{r.notes}</p>}
            <div className="actions">
              {r.hasAttachment && <button className="ghost" onClick={() => download(r.id)}>View attachment</button>}
              {user.role === 'doctor' && <label className="ghost filebtn">Upload file<input type="file" accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => upload(r.id, e.target.files[0])} /></label>}
              {user.role !== 'patient' && <button className="ghost danger" onClick={() => remove(r.id)}>Delete</button>}
            </div>
          </article>
        ))}
        {!list.data.length && <p className="muted center">No prescriptions found</p>}
        <Pager page={page} limit={limit} total={list.total} onChange={setPage} />
      </div>
    </>
  );
}

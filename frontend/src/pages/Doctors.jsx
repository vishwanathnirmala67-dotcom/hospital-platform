import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { isEmail } from '../validators.js';
import { Field, Alert, errorInfo } from '../components/ui.jsx';

export default function Doctors() {
  const [list, setList] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [f, setF] = useState({ name: '', specialization: '', hospitalId: '', email: '', password: '' });
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState({ kind: 'error', text: '' });
  const load = () => api('/api/doctors').then((d) => setList(d.data));
  useEffect(() => { load(); api('/api/admin/hospitals').then((d) => setHospitals(d.data)); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (f.name.trim().length < 2) v.name = 'Enter a name';
    if (f.specialization.trim().length < 2) v.specialization = 'Enter a specialization';
    if (!isEmail(f.email)) v.email = 'Enter a valid email';
    if (f.password.length < 8 || !/\d/.test(f.password) || !/[A-Za-z]/.test(f.password)) v.password = '8+ characters with letters and a digit';
    setErrs(v); if (Object.keys(v).length) return;
    try { await api('/api/doctors', { method: 'POST', body: { ...f, hospitalId: f.hospitalId ? Number(f.hospitalId) : undefined } }); setF({ name: '', specialization: '', hospitalId: '', email: '', password: '' }); setMsg({ kind: 'ok', text: 'Doctor added.' }); load(); }
    catch (err) { const i = errorInfo(err); setErrs(i.fields); setMsg({ kind: 'error', text: i.message }); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Remove ${d.name}?`)) return;
    try { await api(`/api/doctors/${d.id}`, { method: 'DELETE' }); load(); } catch (err) { setMsg({ kind: 'error', text: err.message }); }
  };
  return (
    <>
      <h1>Doctors</h1>
      <Alert kind={msg.kind}>{msg.text}</Alert>
      <form className="card grid" onSubmit={submit} noValidate>
        <h2>Add doctor</h2>
        <Field label="Name" error={errs.name}><input value={f.name} onChange={set('name')} /></Field>
        <Field label="Specialization" error={errs.specialization}><input value={f.specialization} onChange={set('specialization')} /></Field>
        <Field label="Hospital"><select value={f.hospitalId} onChange={set('hospitalId')}><option value="">—</option>{hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
        <Field label="Login email" error={errs.email}><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Temporary password" error={errs.password}><input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <button type="submit">Add</button>
      </form>
      <div className="card table-wrap">
        <table><thead><tr><th>Name</th><th>Specialization</th><th>Hospital</th><th /></tr></thead>
          <tbody>{list.map((d) => <tr key={d.id}><td>{d.name}</td><td>{d.specialization}</td><td>{d.hospital || '—'}</td><td className="actions"><button className="ghost danger" onClick={() => remove(d)}>Remove</button></td></tr>)}</tbody></table>
      </div>
    </>
  );
}

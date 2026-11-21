import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { isPhone } from '../validators.js';
import { Field, Alert, Pager, errorInfo } from '../components/ui.jsx';

function PatientForm({ initial, onSave, onCancel, title }) {
  const [f, setF] = useState({ name: '', dob: '', gender: 'unknown', phone: '', email: '', ...initial });
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (f.name.trim().length < 2) v.name = 'Enter the full name';
    if (f.phone && !isPhone(f.phone)) v.phone = 'Enter a valid 10-digit mobile number';
    setErrs(v); setMsg('');
    if (Object.keys(v).length) return;
    const body = { name: f.name, gender: f.gender, ...(f.dob ? { dob: f.dob } : {}), ...(f.phone ? { phone: f.phone } : {}), ...(f.email ? { email: f.email } : {}) };
    try { await onSave(body); } catch (err) { const i = errorInfo(err); setErrs(i.fields); setMsg(i.message); }
  };
  return (
    <form className="card grid" onSubmit={submit} noValidate>
      <h2>{title}</h2>
      <Alert>{msg}</Alert>
      <Field label="Name" error={errs.name}><input value={f.name} onChange={set('name')} /></Field>
      <Field label="Date of birth" error={errs.dob}><input type="date" value={f.dob || ''} onChange={set('dob')} /></Field>
      <Field label="Gender"><select value={f.gender} onChange={set('gender')}><option value="unknown">Unknown</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></Field>
      <Field label="Mobile" error={errs.phone}><input value={f.phone || ''} onChange={set('phone')} /></Field>
      <Field label="Email" error={errs.email}><input type="email" value={f.email || ''} onChange={set('email')} /></Field>
      <div><button type="submit">Save</button> {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}</div>
    </form>
  );
}

export default function Patients() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [gender, setGender] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ data: [], total: 0 });
  const [editing, setEditing] = useState(null); // patient object | 'new' | null
  const [me, setMe] = useState(null);
  const [msg, setMsg] = useState({ kind: 'error', text: '' });
  const limit = 20;
  const isPatient = user.role === 'patient';

  const load = useCallback(() => {
    if (isPatient) { api(`/api/patients/${user.patientId}`).then(setMe).catch((e) => setMsg({ kind: 'error', text: e.message })); return; }
    api('/api/patients' + qs({ q, gender, page, limit })).then(setList).catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, [isPatient, user.patientId, q, gender, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]); // debounce typing

  const save = (id) => async (body) => {
    await api(id ? `/api/patients/${id}` : '/api/patients', { method: id ? 'PATCH' : 'POST', body });
    setEditing(null); setMsg({ kind: 'ok', text: 'Saved.' }); load();
  };
  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}? This also removes their appointments and prescriptions.`)) return;
    try { await api(`/api/patients/${p.id}`, { method: 'DELETE' }); load(); } catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };

  if (isPatient) return (
    <>
      <h1>My profile</h1><Alert kind={msg.kind}>{msg.text}</Alert>
      {me && <PatientForm key={me.id} title="Personal details" initial={me} onSave={save(me.id)} />}
    </>
  );
  return (
    <>
      <h1>Patients</h1>
      <Alert kind={msg.kind}>{msg.text}</Alert>
      {editing && <PatientForm key={editing === 'new' ? 'new' : editing.id} title={editing === 'new' ? 'New patient' : `Edit ${editing.name}`} initial={editing === 'new' ? {} : editing} onSave={save(editing === 'new' ? null : editing.id)} onCancel={() => setEditing(null)} />}
      <div className="card">
        <div className="filters">
          <input placeholder="Search name, phone or email…" aria-label="Search" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          <select aria-label="Gender" value={gender} onChange={(e) => { setPage(1); setGender(e.target.value); }}>
            <option value="">All genders</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="unknown">Unknown</option>
          </select>
          {user.role === 'admin' && <button onClick={() => setEditing('new')}>+ New patient</button>}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>DOB</th><th>Gender</th><th>Mobile</th>{user.role === 'admin' && <th />}</tr></thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id}><td>{p.id}</td><td>{p.name}</td><td>{p.dob || '—'}</td><td>{p.gender}</td><td>{p.phone || '—'}</td>
                  {user.role === 'admin' && <td className="actions"><button className="ghost" onClick={() => setEditing(p)}>Edit</button><button className="ghost danger" onClick={() => remove(p)}>Delete</button></td>}
                </tr>
              ))}
              {!list.data.length && <tr><td colSpan="6" className="muted center">No patients match</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} limit={limit} total={list.total} onChange={setPage} />
      </div>
    </>
  );
}

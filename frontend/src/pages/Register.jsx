import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { validateRegister } from '../validators.js';
import { Field, Alert, errorInfo } from '../components/ui.jsx';

export default function Register() {
  const { user, register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '' });
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState('');
  if (user) return <Navigate to="/" replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const v = validateRegister(f); setErrs(v); setMsg('');
    if (Object.keys(v).length) return;
    try { await register({ ...f, phone: f.phone || undefined }); nav('/'); }
    catch (err) { const i = errorInfo(err); setErrs(i.fields); setMsg(i.message); }
  };
  return (
    <form className="card auth" onSubmit={submit} noValidate>
      <h1>Create patient account</h1>
      <Alert>{msg}</Alert>
      <Field label="Full name" error={errs.name}><input value={f.name} onChange={set('name')} autoComplete="name" /></Field>
      <Field label="Email" error={errs.email}><input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
      <Field label="Mobile (optional)" error={errs.phone}><input value={f.phone} onChange={set('phone')} inputMode="tel" /></Field>
      <Field label="Password" error={errs.password}><input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
      <button type="submit">Create account</button>
      <p className="muted">Already registered? <Link to="/login">Sign in</Link></p>
    </form>
  );
}

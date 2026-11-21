import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { validateLogin } from '../validators.js';
import { Field, Alert, errorInfo } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState('');
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    const v = validateLogin(f); setErrs(v); setMsg('');
    if (Object.keys(v).length) return;
    try { await login(f); nav('/'); } catch (err) { setMsg(errorInfo(err).message); }
  };
  return (
    <form className="card auth" onSubmit={submit} noValidate>
      <h1>Sign in</h1>
      <Alert>{msg}</Alert>
      <Field label="Email" error={errs.email}><input type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Password" error={errs.password}><input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <button type="submit">Sign in</button>
      <p className="muted">New patient? <Link to="/register">Create an account</Link></p>
    </form>
  );
}

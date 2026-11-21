import { useState } from 'react';

export function Field({ label, error, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <em className="err" role="alert">{error}</em>}
    </label>
  );
}

export function Alert({ kind = 'error', children }) {
  return children ? <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div> : null;
}

export function Pager({ page, limit, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pager">
      <button className="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      <span>Page {page} of {pages} · {total} total</span>
      <button className="ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}

/** Turn an ApiError (incl. 422 field details) into a message + field map. */
export function errorInfo(e) {
  const fields = {};
  (e.details || []).forEach((d) => { if (d.field) fields[d.field] = d.message; });
  return { message: e.message, fields };
}

export function useAsync() {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); try { return await fn(); } finally { setBusy(false); } };
  return [busy, run];
}

export const fmt = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

const BASE = import.meta.env.VITE_API_URL || '';
let accessToken = null;          // kept in memory only (not readable by other tabs / persisted XSS loot)
let refreshPromise = null;       // single-flight so parallel 401s trigger ONE refresh
let onAuthLost = () => {};

export const setAuthLostHandler = (fn) => { onAuthLost = fn; };
export const getRefreshToken = () => { try { return localStorage.getItem('rt'); } catch { return null; } };
const setRefreshToken = (t) => { try { t ? localStorage.setItem('rt', t) : localStorage.removeItem('rt'); } catch { /* private mode */ } };

export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export function setSession(data) {
  accessToken = data ? data.accessToken : null;
  setRefreshToken(data ? data.refreshToken : null);
}

async function raw(path, { method = 'GET', body, form, token = accessToken } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  return res;
}

export async function refreshSession() {
  const rt = getRefreshToken();
  if (!rt) throw new ApiError(401, 'Signed out');
  if (!refreshPromise) {
    refreshPromise = fetch(BASE + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) })
      .then(async (r) => { if (!r.ok) throw new ApiError(401, 'Session expired'); const d = await r.json(); setSession(d); return d; })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function api(path, opts = {}) {
  let res = await raw(path, opts);
  if (res.status === 401 && !path.startsWith('/api/auth/') && getRefreshToken()) {
    try { await refreshSession(); res = await raw(path, opts); }
    catch { setSession(null); onAuthLost(); throw new ApiError(401, 'Session expired, please sign in again'); }
  }
  if (res.status === 204) return null;
  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json() : await res.blob();
  if (!res.ok) throw new ApiError(res.status, data?.error?.message || 'Request failed', data?.error?.details);
  return data;
}

export const qs = (o) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)); const s = p.toString(); return s ? `?${s}` : ''; };

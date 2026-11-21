import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setSession, refreshSession, getRefreshToken, setAuthLostHandler } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async () => {
    const rt = getRefreshToken();
    if (rt) api('/api/auth/logout', { method: 'POST', body: { refreshToken: rt } }).catch(() => {});
    setSession(null); setUser(null);
  }, []);

  useEffect(() => {
    setAuthLostHandler(() => setUser(null));
    if (!getRefreshToken()) { setReady(true); return; }
    refreshSession().then((d) => setUser(d.user)).catch(() => setSession(null)).finally(() => setReady(true));
  }, []);

  const authenticate = async (path, body) => {
    const d = await api(path, { method: 'POST', body });
    setSession(d); setUser(d.user); return d.user;
  };
  const value = { user, ready, logout, login: (b) => authenticate('/api/auth/login', b), register: (b) => authenticate('/api/auth/register', b) };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

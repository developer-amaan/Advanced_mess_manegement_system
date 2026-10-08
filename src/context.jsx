import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);
const ToastContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('messmeter-user') || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('messmeter-token')));

  useEffect(() => {
    if (!localStorage.getItem('messmeter-token')) { setLoading(false); return; }
    api('/auth/me').then(({ user: current }) => {
      setUser(current);
      localStorage.setItem('messmeter-user', JSON.stringify(current));
    }).catch(() => {
      localStorage.removeItem('messmeter-token');
      localStorage.removeItem('messmeter-user');
      setUser(null);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('messmeter:unauthorized', onUnauthorized);
    return () => window.removeEventListener('messmeter:unauthorized', onUnauthorized);
  }, []);

  const establishSession = useCallback(({ token, user: nextUser }) => {
    localStorage.setItem('messmeter-token', token);
    localStorage.setItem('messmeter-user', JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);
  const logout = useCallback(() => {
    localStorage.removeItem('messmeter-token');
    localStorage.removeItem('messmeter-user');
    setUser(null);
  }, []);
  const value = useMemo(() => ({ user, loading, establishSession, logout }), [user, loading, establishSession, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const remove = useCallback((id) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const showToast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => remove(id), 3600);
  }, [remove]);
  return <ToastContext.Provider value={showToast}>
    {children}
    <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast toast-${toast.type}`} key={toast.id}><span className="toast-dot" />{toast.message}<button aria-label="Dismiss notification" onClick={() => remove(toast.id)}>×</button></div>)}</div>
  </ToastContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const useToast = () => useContext(ToastContext);

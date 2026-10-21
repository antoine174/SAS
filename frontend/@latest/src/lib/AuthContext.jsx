// src/lib/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchApi } from './api';

const AuthContext = createContext(null);
const TOKEN_KEY = 'sas_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  // Only "loading" on first paint if there is a token to verify
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));

  const persist = useCallback((newToken, newUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchApi('/api/auth/me');
        if (!cancelled) setUser(me);
      } catch (err) {
        // Only drop the token when the server says it is invalid/expired
        if (!cancelled && err?.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await fetchApi('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    persist(data.token, data.user);
    return data.user;
  }, [persist]);

  const signup = useCallback(async (username, email, password) => {
    const data = await fetchApi('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
    persist(data.token, data.user);
    return data.user;
  }, [persist]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

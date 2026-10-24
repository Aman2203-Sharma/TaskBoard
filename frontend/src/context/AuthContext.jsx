import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('taskboard_token'));
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('taskboard_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Verify session on initial load
  useEffect(() => {
    async function verifySession() {
      const storedToken = localStorage.getItem('taskboard_token');
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get('/api/auth/me');
        if (res.data?.user) {
          setUser(res.data.user);
          localStorage.setItem('taskboard_user', JSON.stringify(res.data.user));
        }
      } catch (err) {
        console.error('[AuthContext] session verify failed:', err);
        logout();
      } finally {
        setLoading(false);
      }
    }

    verifySession();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password });
    const { token: newToken, user: newUser } = res.data;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('taskboard_token', newToken);
    localStorage.setItem('taskboard_user', JSON.stringify(newUser));
    return newUser;
  };

  const register = async (name, email, password, favWork, favFood, favShow) => {
    if (typeof name === 'object') {
      const payload = name;
      await api.post('/api/auth/register', payload);
      return await login(payload.email, payload.password);
    }
    await api.post('/api/auth/register', { name, email, password, favWork, favFood, favShow });
    return await login(email, password);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('taskboard_token');
    localStorage.removeItem('taskboard_user');
    localStorage.removeItem('taskboard_active_workspace');
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

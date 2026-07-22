// =====================================================
// Auth Context — Global authentication state
// =====================================================
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('aerovision_token'));
  const [notificationsEnabled, setNotificationsEnabled] = useState(localStorage.getItem('aerovision_notify_opt_in') !== 'false');
  const [loading, setLoading] = useState(true);

  // On mount, verify stored token
  useEffect(() => {
    async function verifyToken() {
      if (token) {
        try {
          const res = await authAPI.getMe();
          setUser(res.data.user);
          connectSocket(token);
        } catch {
          // Token invalid
          localStorage.removeItem('aerovision_token');
          localStorage.removeItem('aerovision_user');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    }
    verifyToken();
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('aerovision_token', newToken);
    localStorage.setItem('aerovision_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    connectSocket(newToken);
    return res.data;
  }, []);

  const register = useCallback(async (email, password, full_name) => {
    const res = await authAPI.register({ email, password, full_name });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('aerovision_token', newToken);
    localStorage.setItem('aerovision_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    connectSocket(newToken);
    return res.data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('aerovision_token');
    localStorage.removeItem('aerovision_user');
    setToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  const saveNotificationPreference = useCallback((enabled) => {
    localStorage.setItem('aerovision_notify_opt_in', enabled ? 'true' : 'false');
    setNotificationsEnabled(enabled);
  }, []);

  const continueAsGuest = useCallback(() => {
    setUser({ full_name: 'Guest', role: 'guest' });
    setLoading(false);
    // Try to connect socket — silently ignore if backend is offline
    try { connectSocket(); } catch (e) { /* backend offline is fine */ }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      register,
      logout,
      continueAsGuest,
      isAuthenticated: !!token,
      notificationsEnabled,
      saveNotificationPreference,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

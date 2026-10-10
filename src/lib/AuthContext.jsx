import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { AUTH_EXPIRED_EVENT } from '@/api/client';
import { queryClientInstance } from '@/lib/query-client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState({});
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  // The API client fires this when a request comes back 401 mid-session.
  // Dropping the user makes ProtectedRoute send them to /login (with a
  // returnUrl), and clearing the cache keeps the next user's session from
  // seeing stale data.
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setIsAuthenticated(false);
      setSessionExpired(true);
      queryClientInstance.clear();
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const checkAuth = async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
      if (error.status === 401) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const login = async (email, password) => {
    const result = await base44.auth.login(email, password);
    setUser(result);
    setIsAuthenticated(true);
    setAuthError(null);
    setSessionExpired(false);
    return result;
  };

  const signup = async (email, password, full_name) => {
    const result = await base44.auth.signup(email, password, full_name);
    setUser(result);
    setIsAuthenticated(true);
    setAuthError(null);
    setSessionExpired(false);
    return result;
  };

  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    await base44.auth.logout();
    window.location.href = '/login';
  };

  const navigateToLogin = () => {
    window.location.href = `/login?returnUrl=${encodeURIComponent(window.location.href)}`;
  };

  const checkAppState = checkAuth;

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      sessionExpired,
      appPublicSettings,
      login,
      signup,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

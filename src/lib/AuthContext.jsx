import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ACCOUNT_STATUS_EVENT, AUTH_EXPIRED_EVENT } from '@/api/client';
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

  // A request was refused because the account is awaiting approval or was
  // disabled mid-session: re-read the account so the routes can react.
  useEffect(() => {
    const onStatus = () => { checkAuth(); };
    window.addEventListener(ACCOUNT_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(ACCOUNT_STATUS_EVENT, onStatus);
  }, []);

  const checkAuth = async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);
      const currentUser = await base44.auth.me({ probe: true });
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      const signedOut = error.status === 401 || error.data?.code === 'account_disabled';
      if (!signedOut) {
        // The server couldn't check the session (503 while the database is
        // unreachable, or no connection at all). That isn't "signed out":
        // keep any session already loaded and let the person retry.
        setAuthError({
          type: 'unavailable',
          message: error.status === 503
            ? error.data?.detail || "Couldn't check your session. Try again shortly."
            : "Couldn't reach the server. Check your connection and try again.",
        });
        return;
      }
      setIsAuthenticated(false);
      setUser(null);
      if (error.status === 401) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      } else if (error.data?.code === 'account_disabled') {
        queryClientInstance.clear();
        setAuthError({ type: 'account_disabled', message: error.data.detail || 'This account has been disabled.' });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // Sign-in answers the account only; the session (organization, plan,
  // territory) comes from /auth/me.
  const withSession = async (account) => {
    try {
      return await base44.auth.me({ probe: true });
    } catch {
      return account;
    }
  };

  const login = async (email, password) => {
    const result = await withSession(await base44.auth.login(email, password));
    setUser(result);
    setIsAuthenticated(true);
    setAuthError(null);
    setSessionExpired(false);
    return result;
  };

  const signup = async (email, password, full_name, options) => {
    const result = await withSession(await base44.auth.signup(email, password, full_name, options));
    setUser(result);
    setIsAuthenticated(true);
    setAuthError(null);
    setSessionExpired(false);
    return result;
  };

  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    queryClientInstance.clear();
    await base44.auth.logout();
    window.location.href = '/login';
  };

  // Ends the account's sessions on every device, including this one.
  const logoutEverywhere = async () => {
    await base44.auth.logoutEverywhere();
    setUser(null);
    setIsAuthenticated(false);
    queryClientInstance.clear();
    window.location.href = '/login';
  };

  // After a reset or invite link the server has already started a session.
  const adoptSession = (sessionUser) => {
    setUser(sessionUser);
    setIsAuthenticated(true);
    setAuthError(null);
    setSessionExpired(false);
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
      isPending: user?.status === 'pending',
      login,
      signup,
      logout,
      logoutEverywhere,
      adoptSession,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

/** The auth context, or undefined outside an AuthProvider (for optional UI such as tab strips). */
export const useOptionalAuth = () => useContext(AuthContext);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

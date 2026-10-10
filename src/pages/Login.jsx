import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useSearchParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { safeReturnUrl } from '@/lib/returnUrl';

export default function Login() {
  const { login, signup, isAuthenticated, isLoadingAuth, user, authError } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionExpired = searchParams.get('reason') === 'expired';
  const accountDisabled = authError?.type === 'account_disabled';
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const account = isSignup ? await signup(email, password, fullName) : await login(email, password);
      if (account?.status === 'pending') {
        navigate('/pending', { replace: true });
        return;
      }
      navigate(safeReturnUrl(searchParams.get('returnUrl')), { replace: true });
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Hooks above must run unconditionally; only bail out once they have.
  if (!isLoadingAuth && isAuthenticated && !loading) {
    if (user?.status === 'pending') return <Navigate to="/pending" replace />;
    return <Navigate to={safeReturnUrl(searchParams.get('returnUrl'))} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">CareMetric AI</h1>
          <p className="text-slate-400">Healthcare Provider Intelligence Platform</p>
        </div>

        <main className="bg-slate-800 rounded-xl border border-slate-700 p-8">
          <h2 className="text-xl font-semibold text-white mb-6">
            {isSignup ? 'Create Account' : 'Sign In'}
          </h2>

          {accountDisabled && !error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
              {authError.message}
            </div>
          )}

          {isSignup && !error && (
            <div className="mb-4 p-3 bg-cyan-900/30 border border-cyan-500/30 rounded-lg text-cyan-300 text-sm" role="status">
              New accounts need an administrator's approval before they can see any data.
            </div>
          )}

          {sessionExpired && !error && (
            <div className="mb-4 p-3 bg-amber-900/30 border border-amber-500/30 rounded-lg text-amber-400 text-sm" role="status">
              Your session expired. Please sign in again to continue where you left off.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-900/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <div>
                <label id="login-full-name-label" htmlFor="login-full-name" className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  id="login-full-name"
                  aria-labelledby="login-full-name-label"
                  autoComplete="name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="Enter your full name"
                />
              </div>
            )}

            <div>
              <label id="login-email-label" htmlFor="login-email" className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                id="login-email"
                aria-labelledby="login-email-label"
                autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label id="login-password-label" htmlFor="login-password" className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                id="login-password"
                aria-labelledby="login-password-label"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Enter your password"
              />
            </div>

            {!isSignup && (
              <div className="text-right -mt-2">
                <Link to="/forgot-password" className="text-xs text-cyan-400 hover:text-cyan-300">Forgot password?</Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isSignup ? 'Creating Account...' : 'Signing In...'}
                </span>
              ) : (
                isSignup ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => { setIsSignup(!isSignup); setError(''); }}
              className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

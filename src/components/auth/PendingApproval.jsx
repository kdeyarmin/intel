import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import AuthShell from './AuthShell';
import SessionUnavailable from './SessionUnavailable';

const POLL_MS = 30_000;

/** Where a new account waits until an admin approves it. */
export default function PendingApproval() {
  const { user, isAuthenticated, isLoadingAuth, authError, checkAppState, logout } = useAuth();

  // Check back periodically so approval lets the person straight in.
  useEffect(() => {
    const t = setInterval(() => { checkAppState(); }, POLL_MS);
    return () => clearInterval(t);
  }, [checkAppState]);

  if (isLoadingAuth && !user) return null;
  // An outage isn't a sign-out: offer a retry rather than the login page.
  if (!isAuthenticated && authError?.type === 'unavailable') {
    return <SessionUnavailable message={authError.message} onRetry={checkAppState} />;
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.status !== 'pending') return <Navigate to="/" replace />;

  return (
    <AuthShell title="Waiting for approval">
      <div className="flex items-start gap-3 text-slate-300 text-sm leading-relaxed">
        <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-3">
          <p>
            Thanks for signing up{user.full_name ? `, ${user.full_name}` : ''}. An administrator needs to approve{' '}
            <span className="text-white">{user.email}</span> before you can use CareMetric Healthcare Advisors.
          </p>
          <p className="text-slate-400">
            This page checks every 30 seconds and opens the app as soon as you're approved. You can also close it and
            sign in later.
          </p>
        </div>
      </div>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => checkAppState()}
          className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm"
        >
          Check now
        </button>
        <button
          type="button"
          onClick={logout}
          className="flex-1 py-2 border border-slate-600 hover:bg-slate-700 text-slate-300 rounded-lg text-sm"
        >
          Sign out
        </button>
      </div>
    </AuthShell>
  );
}

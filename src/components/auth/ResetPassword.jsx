import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import AuthShell, { inputClass, MIN_PASSWORD_LENGTH, Notice, primaryButtonClass } from './AuthShell';

/** Finishes a password reset or an invite from an emailed or admin-issued link. */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const { adoptSession } = useAuth();
  const [info, setInfo] = useState(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setInfo({ valid: false });
      return undefined;
    }
    base44.auth.tokenInfo(token)
      .then((r) => { if (!cancelled) setInfo(r); })
      .catch(() => { if (!cancelled) setInfo({ valid: false }); });
    return () => { cancelled = true; };
  }, [token]);

  const invite = info?.purpose === 'invite';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const user = await base44.auth.resetPassword(token, password, invite ? fullName : undefined);
      adoptSession(user);
      navigate(user.status === 'pending' ? '/pending' : '/', { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  if (!info) return <AuthShell title="Checking your link…" />;

  if (!info.valid) {
    return (
      <AuthShell
        title="This link doesn't work"
        footer={<Link to="/login" className="text-cyan-400 hover:text-cyan-300">Back to sign in</Link>}
      >
        <Notice tone="warn">
          The link is invalid, was already used, or has expired. Request a new one, or ask an administrator.
        </Notice>
        <Link to="/forgot-password" className="text-sm text-cyan-400 hover:text-cyan-300">Request a new reset link</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={invite ? 'Set up your account' : 'Choose a new password'}>
      <p className="text-sm text-slate-400 mb-4">
        {invite ? 'Choose a password for ' : 'Set a new password for '}
        <span className="text-white">{info.email}</span>.
        {!invite && ' This signs you out everywhere else.'}
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <form onSubmit={submit} className="space-y-4">
        {invite && !info.full_name && (
          <div>
            <label htmlFor="reset-name" className="block text-sm font-medium text-slate-300 mb-1">Full name</label>
            <input id="reset-name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </div>
        )}
        <div>
          <label htmlFor="reset-password" className="block text-sm font-medium text-slate-300 mb-1">New password</label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            aria-describedby="reset-password-hint"
          />
          <p id="reset-password-hint" className="mt-1 text-xs text-slate-400">At least {MIN_PASSWORD_LENGTH} characters.</p>
        </div>
        <div>
          <label htmlFor="reset-confirm" className="block text-sm font-medium text-slate-300 mb-1">Confirm password</label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? 'Saving…' : invite ? 'Create account' : 'Set password'}
        </button>
      </form>
    </AuthShell>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import AuthShell, { inputClass, Notice, primaryButtonClass } from './AuthShell';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      setResult(await base44.auth.forgotPassword(email));
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      footer={<Link to="/login" className="text-cyan-400 hover:text-cyan-300">Back to sign in</Link>}
    >
      {result ? (
        <Notice tone={result.emailReset ? 'success' : 'warn'}>{result.message}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Notice tone="error">{error}</Notice>}
          <p className="text-sm text-slate-400">
            Enter the email you sign in with. If password reset by email is set up, we'll send you a link.
          </p>
          <div>
            <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={loading} className={primaryButtonClass}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

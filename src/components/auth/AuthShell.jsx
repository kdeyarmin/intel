import { Link } from 'react-router-dom';
import { CAREMETRIC_LOGO_URL } from '@/lib/branding';

/** Shared frame for the signed-out screens (login, reset, awaiting approval). */
export default function AuthShell({ title, children, footer }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/landing" className="inline-block">
            <img src={CAREMETRIC_LOGO_URL} alt="CareMetric Healthcare Advisors" className="w-44 h-16 mx-auto mb-4 rounded-lg object-contain bg-white" />
            <h1 className="text-3xl font-bold text-white mb-2">CareMetric Intel</h1>
          </Link>
          <p className="text-slate-400">Healthcare Provider Intelligence Platform</p>
        </div>
        <main className="bg-slate-800 rounded-xl border border-slate-700 p-8">
          {title && <h2 className="text-xl font-semibold text-white mb-6">{title}</h2>}
          {children}
        </main>
        {footer && <div className="mt-6 text-center text-sm">{footer}</div>}
        <p className="mt-4 text-center text-xs text-slate-400">
          CareMetric Intel by CareMetric Healthcare Advisors ·{' '}
          <a href="https://caremetricintel.com/" className="text-cyan-400 hover:underline">caremetricintel.com</a>
        </p>
      </div>
    </div>
  );
}

export const inputClass =
  'w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent';

export const primaryButtonClass =
  'w-full py-2.5 bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors';

export function Notice({ tone = 'info', children }) {
  const tones = {
    info: 'bg-cyan-900/30 border-cyan-500/30 text-cyan-300',
    warn: 'bg-amber-900/30 border-amber-500/30 text-amber-400',
    error: 'bg-red-900/30 border-red-500/30 text-red-400',
    success: 'bg-emerald-900/30 border-emerald-500/30 text-emerald-400',
  };
  return (
    <div className={`mb-4 p-3 border rounded-lg text-sm ${tones[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export const MIN_PASSWORD_LENGTH = 8;

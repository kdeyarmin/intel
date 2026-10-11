/** Shared frame for the signed-out screens (login, reset, awaiting approval). */
export default function AuthShell({ title, children, footer }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">CareMetric AI</h1>
          <p className="text-slate-400">Healthcare Provider Intelligence Platform</p>
        </div>
        <main className="bg-slate-800 rounded-xl border border-slate-700 p-8">
          {title && <h2 className="text-xl font-semibold text-white mb-6">{title}</h2>}
          {children}
        </main>
        {footer && <div className="mt-6 text-center text-sm">{footer}</div>}
      </div>
    </div>
  );
}

export const inputClass =
  'w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent';

export const primaryButtonClass =
  'w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors';

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

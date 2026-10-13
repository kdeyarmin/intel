// The session couldn't be checked (server or database briefly down): say so
// and offer a retry instead of sending a signed-in person to the login page.
export default function SessionUnavailable({ message, onRetry }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900 p-4">
      <div role="alert" className="max-w-sm rounded-lg border border-amber-500/30 bg-amber-900/30 p-6 text-center">
        <p className="font-semibold text-amber-400">CareMetric Healthcare Advisors is temporarily unavailable</p>
        <p className="mt-2 text-sm text-slate-300">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

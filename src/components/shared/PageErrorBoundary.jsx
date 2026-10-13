import React, { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// After a deploy, a tab opened earlier asks for page bundles that no longer
// exist; the fix is simply to reload.
export function isChunkLoadError(error) {
  const msg = String(error?.message || error || '');
  return error?.name === 'ChunkLoadError'
    || /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \S+ failed/i.test(msg);
}

/**
 * Catches render errors inside one page so the sidebar and header keep
 * working. Mount it with key={pathname} so navigating away resets it.
 */
export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[PageErrorBoundary]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error);
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        <div role="alert" className="mx-auto mt-12 max-w-lg rounded-xl border border-red-500/30 bg-red-900/20 p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <h1 className="mb-2 text-lg font-semibold text-white">
            {stale ? 'A new version of the app is available' : 'This page ran into a problem'}
          </h1>
          <p className="mb-5 text-sm text-slate-300">
            {stale
              ? 'Reload to get the latest version.'
              : 'The rest of the app still works — you can use the sidebar to go elsewhere, or try this page again.'}
          </p>
          {!stale && error?.message && (
            <p className="mb-5 break-words rounded bg-slate-900/60 px-3 py-2 font-mono text-xs text-red-300/80">{error.message}</p>
          )}
          <div className="flex justify-center gap-2">
            {!stale && (
              <Button variant="outline" onClick={() => this.setState({ error: null })} className="border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800">
                Retry
              </Button>
            )}
            <Button onClick={() => window.location.reload()} className="bg-cyan-600 hover:bg-cyan-700">
              <RefreshCw className="mr-2 h-4 w-4" /> Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

function parseParam(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof fallback === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof fallback === 'boolean') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
  }
  return raw;
}

export function readUrlState(params, defaults) {
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [key, parseParam(params.get(key), fallback)]),
  );
}

export function writeUrlState(params, defaults, patch) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in defaults)) continue;
    // Defaults and blanks stay out of the URL so links stay short and readable.
    if (value == null || value === '' || value === defaults[key]) next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

/**
 * Page state (search, filters, sort, page, tab, open record) kept in the query
 * string, so the back button restores it and a URL can be shared. Values are
 * typed by their default (string, number or boolean).
 *
 * `defaults` must be a stable object (define it at module level).
 *
 * @template {Record<string, string | number | boolean>} T
 * @param {T} defaults
 * @returns {[T, (patch: Partial<T> | ((current: T) => Partial<T>)) => void]}
 */
export function useUrlState(defaults) {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params, defaults), [params, defaults]);

  const setState = useCallback((update) => {
    setParams((prev) => {
      const patch = typeof update === 'function' ? update(readUrlState(prev, defaults)) : update;
      return writeUrlState(prev, defaults, patch);
    }, { replace: true });
  }, [setParams, defaults]);

  return [state, setState];
}

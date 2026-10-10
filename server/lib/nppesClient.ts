// NPPES NPI Registry API client: a timeout on every call, a couple of retries
// for transient failures, and a 24h in-memory cache (registry data changes
// slowly, and the provider page may ask for the same NPI repeatedly).
const NPPES_API_BASE = "https://npiregistry.cms.hhs.gov/api/?version=2.1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 5000;

export class NppesUnavailableError extends Error {
  constructor(message = "The NPI Registry didn't respond. Try again in a minute.") {
    super(message);
    this.name = "NppesUnavailableError";
  }
}

export interface NppesResponse {
  status: number;
  body: any;
  durationMs: number;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; json(): Promise<any> }>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One registry request with timeout + retry on network errors, 429 and 5xx. */
export async function requestNppes(
  npi: string,
  { fetchImpl = fetch as unknown as FetchLike, timeoutMs = 8000, retries = 2, backoffMs = 500 } = {},
): Promise<NppesResponse> {
  const url = `${NPPES_API_BASE}&number=${encodeURIComponent(npi)}`;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(backoffMs * 3 ** (attempt - 1));
    const started = Date.now();
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const body = await res.json().catch(() => null);
      return { status: res.status, body, durationMs: Date.now() - started };
    } catch (e) {
      lastError = e;
    }
  }
  throw Object.assign(new NppesUnavailableError(), { cause: lastError });
}

const cache = new Map<string, { at: number; result: any | null }>();

/** The registry's record for an NPI, or null when the registry has none. */
export async function lookupNpi(npi: string, options: Parameters<typeof requestNppes>[1] & { now?: number } = {}): Promise<any | null> {
  const now = options.now ?? Date.now();
  const hit = cache.get(npi);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.result;

  const { status, body } = await requestNppes(npi, options);
  if (status >= 400 && status !== 404) {
    throw new NppesUnavailableError(body?.Errors?.[0]?.description || `The NPI Registry rejected the request (HTTP ${status}).`);
  }
  const result = body?.result_count > 0 && Array.isArray(body.results) ? body.results[0] : null;
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(npi, { at: now, result });
  return result;
}

export function clearNppesCache() {
  cache.clear();
}

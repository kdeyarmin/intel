// Connection checks for admin-configured data sources (API connectors and
// import URLs). The fetch goes through safeFetch; classifyConnectorResponse
// turns the outcome into a plain-language verdict.
import { safeFetch, SafeFetchError, type SafeFetchOptions } from "./safeFetch";

export type CheckStatus = "success" | "warning" | "failed";

export interface CheckResult {
  status: CheckStatus;
  message: string;
  http_status: number | null;
  content_type: string | null;
  elapsed_ms: number | null;
  final_url?: string;
}

export interface ResponseSummary {
  status: number;
  contentType?: string | null;
  contentLength?: number | null;
  body?: string;
  truncated?: boolean;
  elapsedMs?: number;
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} bytes`;
}

/** Describe a JSON payload: "25 records" for arrays (or {data:[...]}), else its top-level keys. */
function describeJson(body: string, truncated: boolean): string | null {
  try {
    const parsed = JSON.parse(body);
    const list = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.data) ? parsed.data
        : Array.isArray(parsed?.results) ? parsed.results
          : null;
    if (list) return `${list.length} record${list.length === 1 ? "" : "s"} in the first page`;
    if (parsed && typeof parsed === "object") {
      const keys = Object.keys(parsed).slice(0, 4);
      return keys.length ? `JSON with ${keys.join(", ")}` : "an empty JSON object";
    }
    return "JSON";
  } catch {
    // A body cut off at the size cap won't parse; it still looked like JSON.
    return truncated && /^\s*[[{]/.test(body) ? "JSON (large response)" : null;
  }
}

export function classifyConnectorResponse(r: ResponseSummary): CheckResult {
  const contentType = (r.contentType || "").split(";")[0].trim().toLowerCase() || null;
  const base = { http_status: r.status, content_type: contentType, elapsed_ms: r.elapsedMs ?? null };
  const timing = r.elapsedMs != null ? ` in ${r.elapsedMs} ms` : "";

  if (r.status === 401 || r.status === 403) {
    return { ...base, status: "failed", message: `Authentication failed (HTTP ${r.status}). Check the API key.` };
  }
  if (r.status === 404) return { ...base, status: "failed", message: "Not found (HTTP 404). Check the URL." };
  if (r.status === 429) {
    return { ...base, status: "warning", message: "Reachable, but the server is rate limiting requests (HTTP 429). Lower the rate limit." };
  }
  if (r.status >= 500) return { ...base, status: "failed", message: `The server returned an error (HTTP ${r.status}). Try again later.` };
  if (r.status >= 400) return { ...base, status: "failed", message: `The request was rejected (HTTP ${r.status}).` };
  if (r.status < 200 || r.status >= 300) {
    return { ...base, status: "warning", message: `Unexpected response (HTTP ${r.status}).` };
  }

  const body = r.body || "";
  const json = contentType?.includes("json") || /^\s*[[{]/.test(body) ? describeJson(body, !!r.truncated) : null;
  if (json) return { ...base, status: "success", message: `Connected${timing}: ${json}.` };
  if (contentType === "text/html") {
    return { ...base, status: "warning", message: "Reachable, but it returned a web page rather than data. Check that the URL points at the API or file." };
  }
  const size = r.contentLength ? `, ${formatBytes(r.contentLength)}` : "";
  return { ...base, status: "success", message: `Connected${timing}: ${contentType || "file"}${size}.` };
}

export async function checkUrl(url: string, options: SafeFetchOptions = {}): Promise<CheckResult> {
  try {
    const res = await safeFetch(url, options);
    const length = Number(res.headers["content-length"]);
    const result = classifyConnectorResponse({
      status: res.status,
      contentType: (res.headers["content-type"] as string) || null,
      contentLength: Number.isFinite(length) && length > 0 ? length : null,
      body: res.body.toString("utf8"),
      truncated: res.truncated,
      elapsedMs: res.elapsedMs,
    });
    return { ...result, final_url: res.finalUrl };
  } catch (e: any) {
    const message = e instanceof SafeFetchError ? e.message : "Couldn't connect to the server.";
    return { status: "failed", message, http_status: null, content_type: null, elapsed_ms: null };
  }
}

/** Header carrying a connector's API key: "Authorization: Bearer <key>" unless the connector names another header. */
export function apiKeyHeaders(apiKey: string | null | undefined, headerName?: string | null): Record<string, string> {
  if (!apiKey) return {};
  const name = (headerName || "").trim();
  if (!name || name.toLowerCase() === "authorization") return { authorization: `Bearer ${apiKey}` };
  if (!/^[A-Za-z0-9-]{1,64}$/.test(name)) return { authorization: `Bearer ${apiKey}` };
  return { [name]: apiKey };
}

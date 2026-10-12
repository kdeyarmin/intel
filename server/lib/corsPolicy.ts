// Which browser origins may call the API. Pure of the database so it can be tested on its own.
import cors from "cors";
import type { Request } from "express";

/**
 * Whether an Origin header names this server itself. Browsers send Origin on every same-origin POST (sign-in) and
 * on the SPA's own `<script type="module" crossorigin>` loads, so a deployment that serves the SPA from the API
 * has to accept its own origin even when ALLOWED_ORIGINS is empty.
 *
 * The scheme is the request's own (Express's `trust proxy` setting decides whether X-Forwarded-Proto counts). An
 * https origin on our host is accepted whatever the request says: behind a proxy that ends TLS without being
 * trusted the request looks like plain http, and only a page served over TLS from this very host can name it.
 */
export function isOwnOrigin(origin: string, req: Pick<Request, "protocol" | "get">): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = req.get("host");
  if (!host || url.host.toLowerCase() !== host.toLowerCase()) return false;
  return url.protocol === "https:" || url.protocol === `${req.protocol}:`;
}

/**
 * Outside production every origin is reflected (Vite runs on another port). In production a request is let through
 * when it has no Origin (non-browser callers), names this server, or is on the ALLOWED_ORIGINS list; anything else
 * is an error, answered with a 500 and no CORS headers.
 */
export function corsPolicy(opts: { production: boolean; allowedOrigins: readonly string[] }) {
  return cors<Request>((req, callback) => {
    const origin = req.headers.origin;
    const allowed = !opts.production || !origin || isOwnOrigin(origin, req) || opts.allowedOrigins.includes(origin);
    callback(allowed ? null : new Error("Not allowed by CORS"), { credentials: true, origin: true });
  });
}

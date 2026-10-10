/**
 * Express "trust proxy" from TRUST_PROXY.
 *
 * - unset: true. The left-most X-Forwarded-For address is used, which is what
 *   the app always did; a client can forge it, so set a hop count when you know it.
 * - "false": ignore X-Forwarded-For (the app is reached directly).
 * - a number: trust that many proxies in front of the app (e.g. "1").
 * - anything else: passed through (an IP/CIDR list, "loopback", "uniquelocal").
 */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  const v = (value ?? "").trim();
  if (!v || v === "true") return true;
  if (v === "false") return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

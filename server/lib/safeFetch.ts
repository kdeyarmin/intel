// Outbound HTTP for URLs that come from users (connector URLs, import source
// URLs). Guards against server-side request forgery: only https, no embedded
// credentials, and every address a hostname resolves to — including after each
// redirect — must be public. Private, loopback, link-local (cloud metadata),
// CGNAT, multicast and reserved ranges are refused before a connection opens.
import https from "https";
import dns from "dns";
import net from "net";

export class SafeFetchError extends Error {
  constructor(public code: "invalid_url" | "blocked_address" | "too_many_redirects" | "timeout" | "network", message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

const BLOCKED = new net.BlockList();
const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];
const V6_BLOCKED: Array<[string, number]> = [
  ["::", 96], // unspecified, loopback, IPv4-compatible
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // deprecated site-local
  ["ff00::", 8], // multicast
];
for (const [addr, prefix] of V4_BLOCKED) BLOCKED.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of V6_BLOCKED) BLOCKED.addSubnet(addr, prefix, "ipv6");
// No rule for ::ffff:0:0/96: BlockList matches IPv4-mapped addresses against
// the IPv4 rules above (and a /96 rule there would match every IPv4 address).

/** Expand an IPv6 address to its eight 16-bit groups (null if it can't be parsed). */
function ipv6Groups(ip: string): number[] | null {
  let s = ip.split("%")[0];
  const dotted = s.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(2).map(Number);
    s = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2
    ? [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail]
    : head;
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => parseInt(g, 16));
  return nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : nums;
}

/** The IPv4 address carried inside an IPv4-mapped or NAT64 IPv6 address. */
function embeddedIPv4(ip: string): string | null {
  const g = ipv6Groups(ip);
  if (!g) return null;
  const mapped = g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff;
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((n) => n === 0);
  if (!mapped && !nat64) return null;
  return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join(".");
}

/** True when the address is not a public unicast address (or isn't an IP at all). */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "");
  const family = net.isIP(ip);
  if (family === 4) return BLOCKED.check(ip, "ipv4");
  if (family === 6) {
    const v4 = embeddedIPv4(ip);
    if (v4 && BLOCKED.check(v4, "ipv4")) return true;
    return BLOCKED.check(ip, "ipv6");
  }
  return true;
}

/** Parse and check a user-supplied URL; throws SafeFetchError("invalid_url"). */
export function validateOutboundUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input.trim()) : input;
  } catch {
    throw new SafeFetchError("invalid_url", "That isn't a valid URL.");
  }
  if (url.protocol !== "https:") throw new SafeFetchError("invalid_url", "Only https:// URLs are allowed.");
  if (url.username || url.password) {
    throw new SafeFetchError("invalid_url", "Put credentials in the API key field, not in the URL.");
  }
  if (!url.hostname) throw new SafeFetchError("invalid_url", "The URL has no host name.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new SafeFetchError("blocked_address", "That address is on a private or reserved network.");
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new SafeFetchError("blocked_address", "That host name points at a private network.");
  }
  return url;
}

export type Lookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const systemLookup: Lookup = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

/** A net.connect lookup that refuses to hand back a blocked address. */
function guardedLookup(resolve: Lookup) {
  return (hostname: string, options: any, callback: (...args: any[]) => void) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0) return callback(Object.assign(new Error(`No addresses for ${hostname}`), { code: "ENOTFOUND" }));
        if (addresses.some((a) => isBlockedAddress(a.address))) {
          return callback(new SafeFetchError("blocked_address", `${hostname} resolves to a private or reserved address.`));
        }
        if (options?.all) return callback(null, addresses);
        return callback(null, addresses[0].address, addresses[0].family);
      },
      (err) => callback(err),
    );
  };
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  /** Stop reading after this many bytes (the rest of the body is discarded). */
  maxBytes?: number;
  /** Deadline for the whole request, redirects included. */
  timeoutMs?: number;
  maxRedirects?: number;
  /** Test seam: replaces DNS resolution. */
  lookup?: Lookup;
}

export interface SafeFetchResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  truncated: boolean;
  finalUrl: string;
  redirects: number;
  elapsedMs: number;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function requestOnce(url: URL, opts: Required<Omit<SafeFetchOptions, "headers">> & { headers: Record<string, string> }, signal: AbortSignal) {
  return new Promise<Omit<SafeFetchResponse, "finalUrl" | "redirects" | "elapsedMs">>((resolve, reject) => {
    const req = https.request(url, {
      method: opts.method,
      headers: { "user-agent": "CareMetric-Connector-Check/1.0", "accept-encoding": "identity", ...opts.headers },
      lookup: guardedLookup(opts.lookup) as any,
      agent: false,
      signal,
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks), truncated });
      };
      res.on("data", (chunk: Buffer) => {
        if (truncated) return;
        const room = opts.maxBytes - size;
        if (chunk.length > room) {
          chunks.push(chunk.subarray(0, room));
          truncated = true;
          finish();
          res.destroy();
          return;
        }
        chunks.push(chunk);
        size += chunk.length;
      });
      res.on("end", finish);
      res.on("error", (err) => (truncated ? finish() : reject(err)));
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Headers to send after a redirect. The caller's headers (API keys, tokens)
 * were meant for the original origin, so a redirect to any other origin
 * (host, port or scheme) drops them all.
 */
export function headersAfterRedirect(from: URL, to: URL, headers: Record<string, string>): Record<string, string> {
  return from.origin === to.origin ? headers : {};
}

export async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
  const opts = {
    method: options.method || "GET",
    headers: options.headers || {},
    maxBytes: options.maxBytes ?? 64 * 1024,
    timeoutMs: options.timeoutMs ?? 8000,
    maxRedirects: options.maxRedirects ?? 3,
    lookup: options.lookup || systemLookup,
  } as const;
  const started = Date.now();
  const signal = AbortSignal.timeout(opts.timeoutMs);
  let url = validateOutboundUrl(input);
  let headers = opts.headers;

  for (let redirects = 0; ; redirects += 1) {
    let res;
    try {
      res = await requestOnce(url, { ...opts, headers }, signal);
    } catch (e: any) {
      if (e instanceof SafeFetchError) throw e;
      if (signal.aborted || e?.name === "AbortError" || e?.name === "TimeoutError") {
        throw new SafeFetchError("timeout", `No response within ${Math.round(opts.timeoutMs / 1000)} seconds.`);
      }
      throw Object.assign(new SafeFetchError("network", describeNetworkError(e)), { cause: e });
    }
    const location = res.headers.location;
    if (REDIRECTS.has(res.status) && typeof location === "string") {
      if (redirects >= opts.maxRedirects) throw new SafeFetchError("too_many_redirects", "Too many redirects.");
      const next = validateOutboundUrl(new URL(location, url));
      headers = headersAfterRedirect(url, next, headers);
      url = next;
      continue;
    }
    return { ...res, finalUrl: url.toString(), redirects, elapsedMs: Date.now() - started };
  }
}

export function describeNetworkError(e: any): string {
  const code = e?.code || e?.cause?.code;
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Host not found. Check the domain name.";
    case "ECONNREFUSED":
      return "Connection refused by the server.";
    case "ECONNRESET":
      return "The server closed the connection.";
    case "CERT_HAS_EXPIRED":
      return "The server's TLS certificate has expired.";
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return "The server's TLS certificate isn't trusted.";
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "The server's TLS certificate doesn't match the host name.";
    default:
      return e?.message ? `Couldn't connect: ${e.message}` : "Couldn't connect to the server.";
  }
}

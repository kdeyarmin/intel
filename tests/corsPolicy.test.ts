/**
 * Which browser origins may call the API (server/lib/corsPolicy.ts). Browsers send Origin on same-origin POSTs
 * (sign-in) and on the SPA's own module-script loads, so a deployment that serves the SPA from the API and leaves
 * ALLOWED_ORIGINS empty (what the README and .env.example describe) must still answer its own origin.
 */
import http from "http";
import type { AddressInfo } from "net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { corsPolicy, isOwnOrigin } from "../server/lib/corsPolicy";

const servers: http.Server[] = [];
afterEach(() => { while (servers.length) servers.pop()!.close(); });

async function serve(opts: { production?: boolean; allowedOrigins?: string[]; trustProxy?: boolean }): Promise<number> {
  const app = express();
  app.set("trust proxy", !!opts.trustProxy);
  app.use(corsPolicy({ production: opts.production ?? true, allowedOrigins: opts.allowedOrigins ?? [] }));
  app.all("/api/x", (_req, res) => { res.json({ ok: true }); });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  return (server.address() as AddressInfo).port;
}

function call(port: number, o: { method?: string; host?: string; origin?: string; headers?: Record<string, string> }): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...(o.host ? { Host: o.host } : {}), ...(o.origin ? { Origin: o.origin } : {}), ...o.headers };
    const req = http.request({ host: "127.0.0.1", port, method: o.method ?? "GET", path: "/api/x", headers }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("isOwnOrigin", () => {
  const req = (host: string | undefined, protocol = "http") => ({ protocol, get: (h: string) => (h.toLowerCase() === "host" ? host : undefined) }) as any;

  it("matches the host the request was addressed to", () => {
    expect(isOwnOrigin("http://localhost:3001", req("localhost:3001"))).toBe(true);
    expect(isOwnOrigin("https://App.Example.com", req("app.example.com", "https"))).toBe(true);
  });

  it("does not match another host, another port or a malformed origin", () => {
    expect(isOwnOrigin("https://evil.example", req("app.example.com", "https"))).toBe(false);
    expect(isOwnOrigin("https://app.example.com:8443", req("app.example.com", "https"))).toBe(false);
    expect(isOwnOrigin("https://app.example.com.evil.example", req("app.example.com", "https"))).toBe(false);
    expect(isOwnOrigin("null", req("app.example.com"))).toBe(false);
    expect(isOwnOrigin("", req("app.example.com"))).toBe(false);
    expect(isOwnOrigin("http://app.example.com", req(undefined))).toBe(false);
  });

  it("takes an https origin on our host whatever the request's own scheme says, but not http over https", () => {
    expect(isOwnOrigin("https://app.example.com", req("app.example.com", "http"))).toBe(true);
    expect(isOwnOrigin("http://app.example.com", req("app.example.com", "https"))).toBe(false);
  });
});

describe("production, no ALLOWED_ORIGINS", () => {
  it("answers requests with no Origin header", async () => {
    const res = await call(await serve({}), {});
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers the server's own origin: the SPA's module scripts and sign-in POST carry it", async () => {
    const port = await serve({});
    const origin = `http://127.0.0.1:${port}`;
    for (const method of ["GET", "POST"]) {
      const res = await call(port, { method, origin });
      expect(res.status, method).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    }
  });

  it("answers an https origin on the public host when TLS ends at a proxy that isn't trusted", async () => {
    const res = await call(await serve({}), { host: "app.example.com", origin: "https://app.example.com" });
    expect(res.status).toBe(200);
  });

  it("rejects another site, another port and the opaque origin", async () => {
    const port = await serve({});
    for (const origin of ["https://evil.example", `http://127.0.0.1:${port + 1}`, "null"]) {
      expect((await call(port, { origin })).status, origin).toBe(500);
    }
  });

  it("rejects an http page that calls its own host over https", async () => {
    const port = await serve({ trustProxy: true });
    const res = await call(port, { host: "app.example.com", origin: "http://app.example.com", headers: { "X-Forwarded-Proto": "https" } });
    expect(res.status).toBe(500);
  });

  it("answers a preflight from its own origin and refuses one from another site", async () => {
    const port = await serve({});
    const preflight = (origin: string) => call(port, { method: "OPTIONS", origin, headers: { "Access-Control-Request-Method": "POST" } });
    const own = await preflight(`http://127.0.0.1:${port}`);
    expect(own.status).toBe(204);
    expect(own.headers["access-control-allow-origin"]).toBe(`http://127.0.0.1:${port}`);
    expect((await preflight("https://evil.example")).status).toBe(500);
  });
});

describe("production, with ALLOWED_ORIGINS", () => {
  it("also answers the listed origins, and only those", async () => {
    const port = await serve({ allowedOrigins: ["https://app.example.com"] });
    const ok = await call(port, { origin: "https://app.example.com" });
    expect(ok.status).toBe(200);
    expect(ok.headers["access-control-allow-origin"]).toBe("https://app.example.com");
    expect((await call(port, { origin: "https://other.example.com" })).status).toBe(500);
  });
});

describe("outside production", () => {
  it("reflects any origin", async () => {
    const res = await call(await serve({ production: false }), { origin: "http://localhost:5000" });
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5000");
  });
});

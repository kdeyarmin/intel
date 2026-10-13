import { describe, it, expect, vi } from "vitest";
import { headersAfterRedirect, isBlockedAddress, safeFetch, SafeFetchError, safeFetchStream, validateOutboundUrl } from "../server/lib/safeFetch";
import { apiKeyHeaders, classifyConnectorResponse } from "../server/lib/connectorCheck";
import { buildNpiValidationRecord, isValidNpi } from "../server/lib/npiValidation";
import { clearNppesCache, lookupNpi, NppesUnavailableError, requestNppes } from "../server/lib/nppesClient";
import { checkDomain, checkDomainCached, clearEmailDnsCache, scoreEmail, type DnsResolver, type DomainCheck } from "../server/lib/emailVerification";

describe("SSRF guard", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::a00:1", "[::1]",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "52.84.12.3", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows public %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it("drops the caller's headers (API keys) when a redirect leaves the original origin", () => {
    const key = { "x-api-key": "secret" };
    const u = (s: string) => new URL(s);
    expect(headersAfterRedirect(u("https://api.example.com/a"), u("https://api.example.com/b"), key)).toBe(key);
    expect(headersAfterRedirect(u("https://api.example.com/a"), u("https://evil.example.net/"), key)).toEqual({});
    expect(headersAfterRedirect(u("https://api.example.com/a"), u("https://api.example.com:8443/"), key)).toEqual({});
    expect(headersAfterRedirect(u("https://api.example.com/a"), u("https://sub.api.example.com/"), key)).toEqual({});
    // A Range request stays one, so a resumed download doesn't restart from byte 0.
    expect(headersAfterRedirect(u("https://a.example.com/f"), u("https://cdn.example.net/f"), { ...key, Range: "bytes=10-" }))
      .toEqual({ Range: "bytes=10-" });
  });

  it("guards the streaming import downloads the same way", async () => {
    await expect(safeFetchStream("http://download.cms.gov/nppes.csv")).rejects.toMatchObject({ code: "invalid_url" });
    await expect(safeFetchStream("https://169.254.169.254/latest/meta-data/")).rejects.toMatchObject({ code: "blocked_address" });
    const lookup = vi.fn(async () => [{ address: "10.0.0.5", family: 4 }]);
    await expect(safeFetchStream("https://bucket.example.net/nppes.csv", { lookup, headers: { Range: "bytes=0-" } }))
      .rejects.toMatchObject({ code: "blocked_address" });
    expect(lookup).toHaveBeenCalledWith("bucket.example.net");
  });

  it("only accepts https URLs without credentials or private hosts", () => {
    expect(validateOutboundUrl("https://data.cms.gov/data-api/v1/dataset/x/data").hostname).toBe("data.cms.gov");
    expect(() => validateOutboundUrl("http://data.cms.gov")).toThrow(/https/);
    expect(() => validateOutboundUrl("ftp://data.cms.gov")).toThrow(/https/);
    expect(() => validateOutboundUrl("https://user:pw@data.cms.gov")).toThrow(/credentials/);
    expect(() => validateOutboundUrl("https://localhost:8443/")).toThrow(SafeFetchError);
    expect(() => validateOutboundUrl("https://metadata.google.internal/")).toThrow(SafeFetchError);
    expect(() => validateOutboundUrl("https://169.254.169.254/latest/meta-data")).toThrow(/private or reserved/);
    expect(() => validateOutboundUrl("https://[::ffff:10.0.0.1]/")).toThrow(/private or reserved/);
    expect(() => validateOutboundUrl("not a url")).toThrow(/valid URL/);
  });

  it("refuses to connect when DNS answers with a private address", async () => {
    const lookup = vi.fn(async () => [{ address: "10.0.0.5", family: 4 }]);
    await expect(safeFetch("https://rebind.example.net/", { lookup, timeoutMs: 2000 }))
      .rejects.toMatchObject({ code: "blocked_address" });
    expect(lookup).toHaveBeenCalledWith("rebind.example.net");
  });

  it("refuses when any resolved address is private", async () => {
    const lookup = async () => [{ address: "93.184.216.34", family: 4 }, { address: "::1", family: 6 }];
    await expect(safeFetch("https://mixed.example.net/", { lookup, timeoutMs: 2000 }))
      .rejects.toMatchObject({ code: "blocked_address" });
  });

  it("rejects private IP literals before opening a connection", async () => {
    await expect(safeFetch("https://127.0.0.1:1/")).rejects.toMatchObject({ code: "blocked_address" });
  });
});

describe("classifyConnectorResponse", () => {
  it("describes JSON data", () => {
    const r = classifyConnectorResponse({ status: 200, contentType: "application/json; charset=utf-8", body: '[{"a":1},{"a":2}]', elapsedMs: 120 });
    expect(r).toMatchObject({ status: "success", http_status: 200, content_type: "application/json" });
    expect(r.message).toBe("Connected in 120 ms: 2 records in the first page.");
    expect(classifyConnectorResponse({ status: 200, body: '{"data":[{"a":1}],"meta":{}}' }).message).toMatch(/1 record in/);
    expect(classifyConnectorResponse({ status: 200, contentType: "application/json", body: '[{"a":1},{"b"', truncated: true }).message)
      .toMatch(/large response/);
  });

  it("flags web pages, auth failures, missing endpoints and rate limits", () => {
    expect(classifyConnectorResponse({ status: 200, contentType: "text/html", body: "<html>" }).status).toBe("warning");
    expect(classifyConnectorResponse({ status: 401 })).toMatchObject({ status: "failed", message: expect.stringMatching(/API key/) });
    expect(classifyConnectorResponse({ status: 404 }).message).toMatch(/Check the URL/);
    expect(classifyConnectorResponse({ status: 429 }).status).toBe("warning");
    expect(classifyConnectorResponse({ status: 503 }).status).toBe("failed");
  });

  it("reports downloadable files with their size", () => {
    expect(classifyConnectorResponse({ status: 200, contentType: "text/csv", contentLength: 5 * 1024 * 1024, body: "a,b\n1,2" }).message)
      .toMatch(/text\/csv, 5\.0 MB/);
  });

  it("sends the API key as a bearer token unless another header is named", () => {
    expect(apiKeyHeaders(null)).toEqual({});
    expect(apiKeyHeaders("k1")).toEqual({ authorization: "Bearer k1" });
    expect(apiKeyHeaders("k1", "X-API-Key")).toEqual({ "X-API-Key": "k1" });
    expect(apiKeyHeaders("k1", "bad header\r\nx")).toEqual({ authorization: "Bearer k1" });
  });
});

describe("NPI validation", () => {
  it("checks the NPI check digit", () => {
    expect(isValidNpi("1234567893")).toBe(true);
    expect(isValidNpi("1234567890")).toBe(false);
    expect(isValidNpi("3234567893")).toBe(false);
    expect(isValidNpi("12345")).toBe(false);
    expect(isValidNpi(null)).toBe(false);
  });

  const registry = {
    enumeration_type: "NPI-1",
    basic: { first_name: "ANN", last_name: "CARDIO", credential: "M.D.", status: "A", enumeration_date: "2010-01-01", last_updated: "2024-05-01" },
    addresses: [
      { address_purpose: "MAILING", address_1: "PO BOX 1", city: "ELSEWHERE", state: "OH", postal_code: "44101" },
      { address_purpose: "LOCATION", address_1: "1 MAIN ST", city: "PITTSBURGH", state: "PA", postal_code: "152221234", telephone_number: "412-555-0100" },
    ],
    taxonomies: [{ code: "207RC0000X", desc: "Internal Medicine, Cardiovascular Disease", primary: true, state: "PA", license: "MD123" }],
  };

  it("flattens the registry result and finds what differs from our data", () => {
    const r = buildNpiValidationRecord("1234567893", registry, {
      provider: { entity_type: "Individual", first_name: "Ann", last_name: "Cardio-Smith", credential: "MD", status: "Active" },
      location: { address_1: "1 Main St", city: "Pittsburgh", state: "PA", zip: "15222", phone: "4125550199" },
      primaryTaxonomyCode: "207RC0000X",
    }, new Date("2026-01-01T00:00:00Z"));
    expect(r).toMatchObject({
      is_valid: true, status: "active", npi_type: "individual", first_name: "ANN", credentials: ["M.D."],
      address: "1 MAIN ST", city: "PITTSBURGH", zip: "15222-1234", phone: "412-555-0100",
      taxonomies: [{ code: "207RC0000X", primary: true, license: "MD123" }], checked_at: "2026-01-01T00:00:00.000Z",
    });
    expect(r.discrepancies).toEqual([
      'Name: "Ann Cardio-Smith" here, "ANN CARDIO" in the registry.',
      "Practice phone: 4125550199 here, 412-555-0100 in the registry.",
    ]);
  });

  it("compares the street, ignoring USPS abbreviations", () => {
    const base = { city: "Pittsburgh", state: "PA", zip: "15222" };
    expect(buildNpiValidationRecord("1234567893", registry, { location: { ...base, address_1: "1 Main Street" } }).discrepancies).toEqual([]);
    expect(buildNpiValidationRecord("1234567893", registry, { location: { ...base, address_1: "40 Liberty Ave" } }).discrepancies)
      .toEqual(['Practice address: "40 Liberty Ave, Pittsburgh, PA" here, "1 MAIN ST, PITTSBURGH, PA" in the registry.']);
  });

  it("marks NPIs missing from the registry", () => {
    const r = buildNpiValidationRecord("1234567893", null, { provider: { status: "Active" } });
    expect(r).toMatchObject({ is_valid: false, status: "not_found" });
    expect(r.discrepancies[0]).toMatch(/may have been deactivated/);
  });

  it("detects deactivation", () => {
    const r = buildNpiValidationRecord("1234567893", { ...registry, basic: { ...registry.basic, deactivation_date: "2023-01-01" } },
      { provider: { status: "Active" } });
    expect(r).toMatchObject({ is_valid: false, status: "deactivated" });
    expect(r.discrepancies).toContain("The registry lists this NPI as deactivated, but it's marked active here.");
  });
});

describe("NPPES client", () => {
  const ok = (body: any) => ({ status: 200, ok: true, json: async () => body });

  it("retries transient failures", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ status: 503, ok: false, json: async () => ({}) })
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(ok({ result_count: 1, results: [{ number: "1" }] }));
    const res = await requestNppes("1234567893", { fetchImpl, backoffMs: 1 });
    expect(res.body.result_count).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up with NppesUnavailableError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(requestNppes("1234567893", { fetchImpl, retries: 1, backoffMs: 1 })).rejects.toBeInstanceOf(NppesUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("caches lookups, including 'not in the registry'", async () => {
    clearNppesCache();
    const fetchImpl = vi.fn().mockResolvedValue(ok({ result_count: 0, results: [] }));
    expect(await lookupNpi("1234567893", { fetchImpl })).toBeNull();
    expect(await lookupNpi("1234567893", { fetchImpl })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("doesn't cache an error body or a garbled response as 'not in the registry'", async () => {
    clearNppesCache();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => { throw new SyntaxError("Unexpected token <"); } })
      .mockResolvedValueOnce(ok({ Errors: [{ description: "Service is down" }] }))
      .mockResolvedValueOnce(ok({ result_count: 1, results: [{ number: "1234567893" }] }));
    await expect(lookupNpi("1234567893", { fetchImpl })).rejects.toBeInstanceOf(NppesUnavailableError);
    await expect(lookupNpi("1234567893", { fetchImpl })).rejects.toThrow("Service is down");
    expect(await lookupNpi("1234567893", { fetchImpl })).toEqual({ number: "1234567893" });
  });
});

describe("email verification", () => {
  const err = (code: string) => Object.assign(new Error(code), { code });
  const resolver = (over: Partial<DnsResolver>): DnsResolver => ({
    resolveMx: async () => { throw err("ENODATA"); },
    resolve4: async () => { throw err("ENODATA"); },
    resolve6: async () => { throw err("ENODATA"); },
    ...over,
  });

  it("reads MX, missing domains, A-record fallback and null MX", async () => {
    const mx = await checkDomain("clinic.org", resolver({ resolveMx: async () => [{ exchange: "mx2.clinic.org", priority: 20 }, { exchange: "mx1.clinic.org", priority: 10 }] }));
    expect(mx).toMatchObject({ hasMX: true, mxCount: 2, mxHosts: ["mx1.clinic.org", "mx2.clinic.org"] });
    expect(await checkDomain("nope.invalid", resolver({ resolveMx: async () => { throw err("ENOTFOUND"); } })))
      .toMatchObject({ nxdomain: true, hasMX: false });
    expect(await checkDomain("web.org", resolver({ resolve4: async () => ["93.184.216.34"] })))
      .toMatchObject({ hasMX: false, hasAddress: true });
    expect(await checkDomain("nomail.org", resolver({ resolveMx: async () => [{ exchange: "", priority: 0 }] })))
      .toMatchObject({ nullMx: true });
  });

  it("says 'unable to check' when the resolver can't answer MX queries at all", async () => {
    clearEmailDnsCache();
    const broken = resolver({ resolve4: async () => ["93.184.216.34"] }); // even gmail.com has no MX here
    const check = await checkDomainCached("clinic.org", broken);
    expect(check).toMatchObject({ hasMX: null, error: expect.stringMatching(/can't look up mail/) });
    expect(scoreEmail("ann@clinic.org", check).status).toBe("unknown");

    clearEmailDnsCache();
    const working = resolver({
      resolveMx: async (d: string) => { if (d === "gmail.com") return [{ exchange: "gmail-smtp-in.l.google.com", priority: 5 }]; throw err("ENODATA"); },
      resolve4: async () => ["93.184.216.34"],
    });
    const ok = await checkDomainCached("web-only.org", working);
    expect(ok).toMatchObject({ hasMX: false, hasAddress: true });
    expect(ok.error).toBeUndefined();
  });

  it("reports DNS timeouts as an error instead of guessing", async () => {
    const slow = resolver({ resolveMx: () => new Promise(() => {}) });
    expect((await checkDomain("slow.org", slow, 20)).error).toMatch(/timed out/);
  });

  it("doesn't call a domain address-less when one address lookup timed out", async () => {
    const halfSlow = resolver({ resolve4: () => new Promise(() => {}) }); // AAAA answers ENODATA
    const check = await checkDomain("half.org", halfSlow, 20);
    expect(check.error).toBeTruthy();
    expect(check.hasAddress).toBeNull();
    expect(scoreEmail("ann@half.org", check).status).toBe("unknown");
    // ...but one family answering with an address is enough.
    const v6only = resolver({ resolve4: () => new Promise(() => {}), resolve6: async () => ["2001:db8::1"] });
    expect(await checkDomain("v6.org", v6only, 20)).toMatchObject({ hasAddress: true });
  });

  const mxOk: DomainCheck = { domain: "clinic.org", hasMX: true, mxCount: 1, mxHosts: ["mx"], nullMx: false, hasAddress: null, nxdomain: false };

  it("scores a normal address as valid with medium confidence", () => {
    expect(scoreEmail("dr.ann@clinic.org", mxOk)).toMatchObject({ status: "valid", score: 85, confidence: "medium" });
  });

  it("downgrades role, free-mail and opted-out addresses", () => {
    expect(scoreEmail("info@clinic.org", mxOk)).toMatchObject({ status: "valid", score: 75, riskFlags: ["role_account"] });
    expect(scoreEmail("ann@gmail.com", { ...mxOk, domain: "gmail.com" }).riskFlags).toContain("free_email");
    expect(scoreEmail("ann@clinic.org", mxOk, "unsubscribed")).toMatchObject({ riskFlags: ["opted_out"], recommendation: expect.stringMatching(/opted out/) });
  });

  it("reports a spam complaint as a spam complaint, not an opt-out", () => {
    const r = scoreEmail("ann@clinic.org", mxOk, "spam_report");
    expect(r.riskFlags).toEqual(["spam_complaint"]);
    expect(r.reasons).toContain("The recipient marked an earlier email as spam.");
    expect(r.reasons.join(" ")).not.toMatch(/opted out/);
    expect(r.recommendation).toBe("Don't email: the recipient reported an earlier email as spam.");
  });

  it("marks undeliverable addresses invalid", () => {
    expect(scoreEmail("bad@", mxOk).status).toBe("invalid");
    expect(scoreEmail("x@mailinator.com", mxOk).riskFlags).toEqual(["disposable"]);
    expect(scoreEmail("noreply@clinic.org", mxOk).status).toBe("invalid");
    expect(scoreEmail("ann@clinic.org", mxOk, "bounced").status).toBe("invalid");
    expect(scoreEmail("ann@nope.org", { ...mxOk, hasMX: false, nxdomain: true }).status).toBe("invalid");
    expect(scoreEmail("ann@nope.org", { ...mxOk, hasMX: false, hasAddress: false }).status).toBe("invalid");
  });

  it("treats a domain without MX but with an address as risky, and DNS errors as unknown", () => {
    expect(scoreEmail("ann@web.org", { ...mxOk, hasMX: false, hasAddress: true }).status).toBe("risky");
    expect(scoreEmail("ann@web.org", { ...mxOk, hasMX: null, error: "DNS lookup timed out" })).toMatchObject({ status: "unknown", score: null });
  });
});

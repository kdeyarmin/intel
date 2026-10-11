import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signedIn, startHarness, type Harness } from "./helpers/accountHarness";
import { setSessionUserLoader } from "../server/lib/sessionUsers";

let h: Harness;
afterEach(async () => {
  await h?.close();
});

const linkToken = (text: string) => text.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1];

describe("signup", () => {
  beforeEach(async () => {
    h = await startHarness();
    await h.seed({ email: "admin@example.com", role: "admin" });
  });

  it("creates a pending account, signs it in, and tells the admins", async () => {
    const c = h.client();
    const r = await c.call("POST", "/api/auth/signup", { email: "  New.Person@Example.com ", password: "longenough", full_name: "New Person" });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ id: 2, email: "new.person@example.com", full_name: "New Person", role: "user", status: "pending" });
    expect(r.body.token).toBeUndefined();
    expect(r.setCookie).toMatch(/HttpOnly/i);

    // Signed in but can only see its own pending status.
    expect((await c.call("GET", "/api/auth/me")).body.status).toBe("pending");
    expect((await c.call("POST", "/api/audit", { event_type: "export" })).status).toBe(403);

    await vi_waitFor(() => h.mail.length === 1);
    expect(h.mail[0].to).toBe("admin@example.com");
    expect(h.mail[0].text).toContain("https://app.example.com/AdminSettings");
    expect(h.audits.map((a) => a.action)).toContain("signup");
  });

  it("refuses duplicate emails case-insensitively, the admin address, and weak passwords", async () => {
    const c = h.client();
    expect((await c.call("POST", "/api/auth/signup", { email: "ADMIN@example.com", password: "longenough" })).status).toBe(409);
    expect((await c.call("POST", "/api/auth/signup", { email: "admin@caremetric.local", password: "longenough" })).status).toBe(409);
    expect((await c.call("POST", "/api/auth/signup", { email: "x@example.com", password: "short" })).status).toBe(400);
    expect((await c.call("POST", "/api/auth/signup", { email: "x@example.com", password: "é".repeat(40) })).body.message).toMatch(/72 bytes/);
    expect((await c.call("POST", "/api/auth/signup", { email: "not-an-email", password: "longenough" })).status).toBe(400);
  });
});

describe("login", () => {
  beforeEach(async () => {
    h = await startHarness();
  });

  it("matches email case-insensitively and gives one message for unknown email and wrong password", async () => {
    await h.seed({ email: "rep@example.com" });
    const ok = await h.client().call("POST", "/api/auth/login", { email: "REP@Example.com", password: "password123" });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe("rep@example.com");
    expect(h.repo.users[0].last_login_at).toBeInstanceOf(Date);

    const wrong = await h.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: "nope-nope" });
    const unknown = await h.client().call("POST", "/api/auth/login", { email: "who@example.com", password: "nope-nope" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("doesn't accept a 72-byte password with extra characters appended", async () => {
    const exact = "p".repeat(72);
    await h.seed({ email: "long@example.com", password: exact });
    expect((await h.client().call("POST", "/api/auth/login", { email: "long@example.com", password: exact })).status).toBe(200);
    const padded = await h.client().call("POST", "/api/auth/login", { email: "long@example.com", password: `${exact}extra` });
    expect(padded.status).toBe(401);
  });

  it("locks an email after repeated failures, from any address", async () => {
    await h.seed({ email: "rep@example.com" });
    for (let i = 0; i < 10; i += 1) {
      expect((await h.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: `bad-${i}-xx` })).status).toBe(401);
    }
    const locked = await h.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: "password123" });
    expect(locked.status).toBe(429);
  });

  it("keeps the lockout across server instances and restarts", async () => {
    await h.seed({ email: "rep@example.com" });
    // A second instance on the same database.
    const other = await startHarness({ repo: h.repo });
    try {
      for (let i = 0; i < 10; i += 1) {
        const instance = i % 2 ? other : h;
        expect((await instance.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: `bad-${i}-xx` })).status).toBe(401);
      }
      expect((await h.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: "password123" })).status).toBe(429);
    } finally {
      await other.close();
    }
    // A restarted instance still sees it.
    const restarted = await startHarness({ repo: h.repo });
    try {
      const r = await restarted.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: "password123" });
      expect(r.status).toBe(429);
    } finally {
      await restarted.close();
    }
  });

  it("lets only the allowed number of a parallel burst of guesses through", async () => {
    await h.seed({ email: "rep@example.com" });
    // A slow hash, as with bcrypt: every guess is in flight before any has failed.
    const verify = h.deps.verifyPassword;
    h.deps.verifyPassword = async (pw, hash) => {
      await new Promise((r) => setTimeout(r, 30));
      return verify(pw, hash);
    };
    const statuses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => h.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: `bad-${i}-xx` }).then((r) => r.status)),
    );
    expect(statuses.filter((s) => s === 401)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(10);
  });

  it("clears the count after a correct password", async () => {
    await h.seed({ email: "rep@example.com" });
    for (let i = 0; i < 9; i += 1) await h.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: `bad-${i}-xx` });
    expect((await h.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: "password123" })).status).toBe(200);
    for (let i = 0; i < 9; i += 1) {
      expect((await h.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: `bad-${i}-yy` })).status).toBe(401);
    }
  });

  it("throttles one address across emails", async () => {
    const c = h.client("10.9.9.9");
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await c.call("POST", "/api/auth/login", { email: `u${i}@example.com`, password: "whatever1" })).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("lets a pending account in to see its status, and keeps a disabled one out", async () => {
    await h.seed({ email: "wait@example.com", status: "pending" });
    await h.seed({ email: "gone@example.com", status: "disabled" });
    const pending = await h.client().call("POST", "/api/auth/login", { email: "wait@example.com", password: "password123" });
    expect(pending.status).toBe(200);
    expect(pending.body.status).toBe("pending");
    const disabled = await h.client().call("POST", "/api/auth/login", { email: "gone@example.com", password: "password123" });
    expect(disabled.status).toBe(403);
    expect(disabled.body.code).toBe("account_disabled");
    expect(disabled.setCookie).toBeNull();
  });
});

describe("sessions", () => {
  beforeEach(async () => {
    h = await startHarness();
    await h.seed({ email: "rep@example.com" });
  });

  it("sign out everywhere ends the other devices' sessions", async () => {
    const laptop = await signedIn(h, "rep@example.com");
    const phone = await signedIn(h, "rep@example.com");
    expect((await phone.call("POST", "/api/auth/logout-all")).status).toBe(200);
    expect((await laptop.call("GET", "/api/auth/me")).status).toBe(401);
    expect((await phone.call("GET", "/api/auth/me")).status).toBe(401);
  });

  it("changing the password keeps this device signed in and signs out the others", async () => {
    const laptop = await signedIn(h, "rep@example.com");
    const phone = await signedIn(h, "rep@example.com");
    expect((await laptop.call("POST", "/api/auth/change-password", { current_password: "wrong-one", new_password: "brandnew123" })).status).toBe(400);
    expect((await laptop.call("POST", "/api/auth/change-password", { current_password: "password123", new_password: "brandnew123" })).status).toBe(200);
    expect((await laptop.call("GET", "/api/auth/me")).status).toBe(200);
    expect((await phone.call("GET", "/api/auth/me")).status).toBe(401);
    expect((await h.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: "brandnew123" })).status).toBe(200);
  });

  it("answers 503, not 401, when the session can't be checked", async () => {
    const c = await signedIn(h, "rep@example.com");
    setSessionUserLoader(async () => {
      throw new Error("db down");
    });
    const r = await c.call("GET", "/api/auth/me");
    expect(r.status).toBe(503);
  });

  it("logout clears the cookie", async () => {
    const c = await signedIn(h, "rep@example.com");
    await c.call("POST", "/api/auth/logout");
    expect(c.cookie).toBeNull();
    expect((await c.call("GET", "/api/auth/me")).status).toBe(401);
  });
});

describe("password reset by email", () => {
  it("answers the same way whether or not the email has an account, and emails a single-use link", async () => {
    h = await startHarness();
    await h.seed({ email: "rep@example.com" });
    const old = await signedIn(h, "rep@example.com");

    const known = await h.client().call("POST", "/api/auth/forgot-password", { email: "rep@example.com" });
    const unknown = await h.client().call("POST", "/api/auth/forgot-password", { email: "nobody@example.com" });
    expect(known.body).toEqual(unknown.body);
    await vi_waitFor(() => h.mail.length === 1);
    expect(h.mail[0].to).toBe("rep@example.com");
    const token = linkToken(h.mail[0].text)!;
    expect(h.mail[0].text).toContain("https://app.example.com/reset-password?token=");
    // Only the hash is stored.
    expect(JSON.stringify(h.repo.tokens)).not.toContain(token);

    const info = await h.client().call("GET", `/api/auth/token-info?token=${token}`);
    expect(info.body).toMatchObject({ valid: true, purpose: "reset", email: "rep@example.com" });

    const browser = h.client();
    const done = await browser.call("POST", "/api/auth/reset-password", { token, password: "fresh-pass-1" });
    expect(done.status).toBe(200);
    expect((await browser.call("GET", "/api/auth/me")).status).toBe(200);
    expect((await old.call("GET", "/api/auth/me")).status).toBe(401);
    expect((await h.client().call("POST", "/api/auth/reset-password", { token, password: "again-pass-2" })).status).toBe(400);
    expect((await h.client().call("GET", `/api/auth/token-info?token=${token}`)).body).toEqual({ valid: false });
  });

  it("says to ask an admin when email isn't set up, and sends nothing", async () => {
    h = await startHarness({ mailer: false });
    await h.seed({ email: "rep@example.com" });
    const r = await h.client().call("POST", "/api/auth/forgot-password", { email: "rep@example.com" });
    expect(r.body.emailReset).toBe(false);
    expect(r.body.message).toMatch(/administrator/);
    expect(h.repo.tokens).toHaveLength(0);
    expect((await h.client().call("GET", "/api/auth/options")).body).toEqual({ emailReset: false });
  });

  it("refuses links for disabled accounts and malformed tokens", async () => {
    h = await startHarness();
    await h.seed({ email: "rep@example.com" });
    await h.client().call("POST", "/api/auth/forgot-password", { email: "rep@example.com" });
    await vi_waitFor(() => h.mail.length === 1);
    const token = linkToken(h.mail[0].text)!;
    h.repo.users[0].status = "disabled";
    expect((await h.client().call("POST", "/api/auth/reset-password", { token, password: "fresh-pass-1" })).status).toBe(400);
    expect((await h.client().call("POST", "/api/auth/reset-password", { token: "../../etc", password: "fresh-pass-1" })).status).toBe(400);
  });

  // Hashing the new password is the slow step, after the link was first
  // checked; an admin acting on the account meanwhile must still win.
  // (Distinct emails: forgot-password sends at most 3 links per address an hour.)
  async function changeWhileHashing(email: string, change: () => void) {
    h = await startHarness();
    await h.seed({ email });
    await h.client().call("POST", "/api/auth/forgot-password", { email });
    await vi_waitFor(() => h.mail.length === 1);
    const hash = h.deps.hashPassword;
    h.deps.hashPassword = async (pw) => {
      change();
      return hash(pw);
    };
    return linkToken(h.mail[0].text)!;
  }

  it("refuses the link when the account is disabled while it is being used", async () => {
    const before = { hash: "", version: 0 };
    const token = await changeWhileHashing("disabled-meanwhile@example.com", () => {
      const row = h.repo.users[0];
      row.status = "disabled";
      before.hash = row.password_hash;
      before.version = row.token_version;
    });
    const r = await h.client().call("POST", "/api/auth/reset-password", { token, password: "fresh-pass-1" });
    expect(r.status).toBe(400);
    expect(r.setCookie).toBeNull();
    expect(h.repo.users[0]).toMatchObject({ password_hash: before.hash, token_version: before.version });
  });

  it("answers an invalid link, not an error, when the account is deleted while it is being used", async () => {
    const token = await changeWhileHashing("deleted-meanwhile@example.com", () => {
      void h.repo.delete(h.repo.users[0].id);
    });
    const r = await h.client().call("POST", "/api/auth/reset-password", { token, password: "fresh-pass-1" });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/invalid or has expired/);
  });
});

// Mail and audit writes after the response are fire-and-forget.
async function vi_waitFor(check: () => boolean, ms = 1000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

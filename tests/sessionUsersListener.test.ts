/**
 * Cross-instance session invalidation: a NOTIFY from another instance drops
 * this instance's cached entry at once, and the listener reconnects.
 */
import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSessionUser,
  publishSessionUserChange,
  setSessionUserLoader,
  startSessionUserListener,
  type ListenerClient,
} from "../server/lib/sessionUsers";

class FakeClient extends EventEmitter implements ListenerClient {
  queries: string[] = [];
  constructor(private failConnect = false) { super(); }
  async connect() { if (this.failConnect) throw new Error("refused"); }
  async query(sql: string) { this.queries.push(sql); }
  async end() { this.emit("end"); }
}

let stop: (() => void) | null = null;
afterEach(() => { stop?.(); stop = null; setSessionUserLoader(null); vi.useRealTimers(); });

describe("session user listener", () => {
  it("drops a cached user when another instance announces a change", async () => {
    let version = 1;
    const loader = vi.fn(async (id: number) => ({ id, email: "a@b.c", full_name: null, role: "user", status: "active", token_version: version }));
    setSessionUserLoader(loader);
    const client = new FakeClient();
    stop = startSessionUserListener(() => client);
    await vi.waitFor(() => expect(client.queries).toContain("LISTEN session_user_changed"));

    expect((await getSessionUser(7))?.token_version).toBe(1);
    version = 2; // "sign out everywhere" on another instance
    expect((await getSessionUser(7))?.token_version).toBe(1); // still cached
    client.emit("notification", { channel: "session_user_changed", payload: "7" });
    expect((await getSessionUser(7))?.token_version).toBe(2);
  });

  it("reconnects after the connection fails", async () => {
    vi.useFakeTimers();
    const clients = [new FakeClient(true), new FakeClient()];
    const make = vi.fn(() => clients.shift()!);
    stop = startSessionUserListener(make, 1000);
    await vi.advanceTimersByTimeAsync(1100);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it("publishes the change and drops it locally even if NOTIFY fails", async () => {
    let version = 1;
    setSessionUserLoader(async (id) => ({ id, email: "a@b.c", full_name: null, role: "user", status: "active", token_version: version }));
    await getSessionUser(3);
    version = 5;
    const notify = vi.fn(async () => { throw new Error("db down"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    publishSessionUserChange(3, notify);
    expect(notify).toHaveBeenCalledWith(3);
    expect((await getSessionUser(3))?.token_version).toBe(5);
    warn.mockRestore();
  });
});

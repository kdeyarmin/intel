import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { generateToken } from "../server/middleware/auth";
import { setSessionUserLoader } from "../server/lib/sessionUsers";
import { createAssistantRouter } from "../server/routes/assistant";
import { ASSISTANT_CONFIG } from "../server/lib/assistant/config";
import type { ToolDeps } from "../server/lib/assistant/tools";
import type { StreamFactory } from "../server/lib/assistant/loop";
import { createSseParser } from "../src/lib/sseParser.js";
import { memoryAssistantStore, scriptedStreams, text, toolCall, type Step } from "./helpers/assistantHarness";

// Fresh users per test: the per-minute question limit is per user and per process.
let lastUserId = 0;
let me = 0;
let other = 0;
const emailOf = (id: number) => `user${id}@example.com`;

let server: Server;
let base: string;
let store: ReturnType<typeof memoryAssistantStore>;
let streams: { factory: StreamFactory | null };
let created: any[];
let audits: any[];

function toolDeps(): ToolDeps {
  return {
    searchProviders: vi.fn(async () => ({ providers: [{ npi: "1000000001" }] })),
    describeProviders: vi.fn(async (npis: string[]) => new Map(npis.map((npi) => [npi, { npi, name: `Dr ${npi}`, entityType: "Individual", specialty: null, city: null, state: "PA", score: 70 }]))),
    existingNpis: vi.fn(async (npis: string[]) => npis),
    createProposal: async (input: any) => {
      const row = await store.createAction({ conversationId: input.conversationId, turnId: input.turnId, userId: input.userId, toolUseId: input.toolUseId, kind: "create_lead_list", payload: { name: input.name, npis: input.npis, preview: [] }, expiresAt: new Date(Date.now() + 60_000) });
      return { id: row.id, kind: "create_lead_list", status: "proposed", payload: row.payload, expiresAt: String(row.expires_at) };
    },
  } as unknown as ToolDeps;
}

beforeEach(async () => {
  store = memoryAssistantStore();
  streams = { factory: null };
  created = [];
  audits = [];
  me = ++lastUserId;
  other = ++lastUserId;
  setSessionUserLoader(async (id) => (id <= lastUserId ? { id, email: emailOf(id), role: "user", status: "active", token_version: 0, full_name: null } : null));
  const app = express();
  app.use(express.json());
  app.use("/api/assistant", createAssistantRouter({
    store,
    toolDeps: toolDeps(),
    createStream: () => streams.factory,
    createLeadList: async (_client, input) => {
      created.push(input);
      return { id: 500 + created.length, name: input.name, memberCount: input.npis.length, truncated: 0 };
    },
    audit: async (e) => { audits.push(e); },
  }));
  server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/assistant`;
});

afterEach(async () => {
  setSessionUserLoader(null);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function call(userId: number | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(userId ? { Authorization: `Bearer ${generateToken({ id: userId, token_version: 0 })}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const textBody = await res.text();
  const isSse = res.headers.get("content-type")?.includes("text/event-stream");
  if (isSse) {
    const events: Array<{ event: string; data: any }> = [];
    const parser = createSseParser((e: any) => events.push({ event: e.event, data: JSON.parse(e.data) }));
    parser.push(textBody);
    parser.end();
    return { status: res.status, events, body: null as any };
  }
  return { status: res.status, body: textBody ? JSON.parse(textBody) : null, events: [] as any[] };
}

function script(steps: Step[]) {
  const s = scriptedStreams(steps);
  streams.factory = s.factory;
  return s;
}

describe("assistant routes", () => {
  it("needs a session and keeps conversations private to their owner", async () => {
    expect((await call(null, "GET", "/conversations")).status).toBe(401);
    const mine = (await call(me, "POST", "/conversations", { title: "Mine" })).body.conversation;
    expect((await call(me, "GET", "/conversations")).body.conversations.map((c: any) => c.id)).toEqual([mine.id]);
    expect((await call(other, "GET", "/conversations")).body.conversations).toEqual([]);
    expect((await call(other, "GET", `/conversations/${mine.id}`)).status).toBe(404);
    expect((await call(other, "PATCH", `/conversations/${mine.id}`, { title: "x" })).status).toBe(404);
    expect((await call(other, "DELETE", `/conversations/${mine.id}`)).status).toBe(404);
    expect((await call(other, "POST", `/conversations/${mine.id}/messages`, { text: "hi" })).status).toBe(404);
    expect((await call(me, "DELETE", `/conversations/${mine.id}`)).status).toBe(204);
  });

  it("says when the assistant isn't configured", async () => {
    const conv = (await call(me, "POST", "/conversations")).body.conversation;
    expect((await call(me, "GET", "/status")).body).toMatchObject({ configured: false, model: ASSISTANT_CONFIG.model });
    const res = await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "hi" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("assistant_not_configured");
    expect(store.turns).toHaveLength(0);
  });

  it("validates the question", async () => {
    script([]);
    const conv = (await call(me, "POST", "/conversations")).body.conversation;
    expect((await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "   " })).status).toBe(400);
    expect((await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "x".repeat(ASSISTANT_CONFIG.maxUserMessageChars + 1) })).status).toBe(400);
  });

  it("streams an answer, saves it, titles the conversation and replays it next time", async () => {
    const s = script([text("Allegheny has 4,200 providers."), text("And Butler has fewer.")]);
    const conv = (await call(me, "POST", "/conversations")).body.conversation;
    const res = await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "How many providers in Allegheny?" });
    expect(res.status).toBe(200);
    expect(res.events[0]).toMatchObject({ event: "turn", data: { conversation_id: conv.id } });
    expect(res.events.filter((e) => e.event === "text").map((e) => e.data.delta).join("")).toBe("Allegheny has 4,200 providers.");
    expect(res.events.at(-1)).toEqual({ event: "done", data: { turn_id: res.events[0].data.turn_id, status: "complete", error: null } });

    const view = (await call(me, "GET", `/conversations/${conv.id}`)).body;
    expect(view.conversation.title).toBe("How many providers in Allegheny?");
    expect(view.turns[0]).toMatchObject({ status: "complete", question: "How many providers in Allegheny?", items: [{ type: "text", text: "Allegheny has 4,200 providers." }] });
    expect(store.usage.get(me)).toBe(120);

    await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "And Butler?" });
    expect(s.calls[1].messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(s.calls[1].messages[1].content).toEqual([{ type: "text", text: "Allegheny has 4,200 providers.", citations: null }]);
  });

  it("allows one answer at a time per conversation", async () => {
    script([{ hang: true }]);
    const conv = (await call(me, "POST", "/conversations")).body.conversation;
    const controller = new AbortController();
    const first = fetch(`${base}/conversations/${conv.id}/messages`, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${generateToken({ id: me, token_version: 0 })}` },
      body: JSON.stringify({ text: "Long question" }),
    }).then((r) => r.body?.getReader().read()).catch(() => null);
    await vi.waitFor(() => expect(store.turns[0]?.status).toBe("running"));
    const second = await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "Another" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("turn_running");
    // Closing the connection stops the answer, and the turn isn't replayed later.
    await first;
    controller.abort();
    await vi.waitFor(() => expect(store.turns[0].status).toBe("interrupted"));
  });

  it("never leaves a conversation blocked when something fails mid-turn", async () => {
    script([text("Second try works.")]);
    const conv = (await call(me, "POST", "/conversations")).body.conversation;
    const real = store.loadTranscript;
    store.loadTranscript = async () => { throw new Error("db down"); };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "First" });
    spy.mockRestore();
    expect(failed.events.at(-1)).toMatchObject({ event: "done", data: { status: "error" } });
    expect(store.turns[0].status).toBe("error");
    store.loadTranscript = real;
    const ok = await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "Again" });
    expect(ok.events.at(-1)).toMatchObject({ event: "done", data: { status: "complete" } });
  });

  it("limits how many questions one person sends a minute", async () => {
    script(Array.from({ length: ASSISTANT_CONFIG.requestsPerMinute }, () => text("ok")));
    const conv = (await call(me, "POST", "/conversations")).body.conversation;
    for (let i = 0; i < ASSISTANT_CONFIG.requestsPerMinute; i++) {
      expect((await call(me, "POST", `/conversations/${conv.id}/messages`, { text: `q${i}` })).status).toBe(200);
    }
    const res = await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "one more" });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/faster than the assistant allows/);
    expect((await call(other, "POST", "/conversations")).status).toBe(201);
  });

  it("enforces the daily budget", async () => {
    script([text("never")]);
    store.usage.set(me, ASSISTANT_CONFIG.dailyTokenBudget);
    const conv = (await call(me, "POST", "/conversations")).body.conversation;
    const res = await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "hi" });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("assistant_quota");
    expect(store.turns).toHaveLength(0);
  });

  it("creates a proposed list only on confirm, once, for its owner, and tells the model next turn", async () => {
    const s = script([
      toolCall([{ id: "toolu_p", name: "propose_lead_list", input: { name: "PA cardiology", npis: ["1000000001", "1000000002"] } }]),
      text("Review the card to create it."),
      text("Great, it's created."),
    ]);
    const conv = (await call(me, "POST", "/conversations")).body.conversation;
    const res = await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "Make a list of them" });
    const actionEvent = res.events.find((e) => e.event === "action");
    // Streamed cards have the same shape as saved ones.
    expect(actionEvent?.data).toEqual({ tool_use_id: "toolu_p", action: expect.objectContaining({ kind: "create_lead_list", status: "proposed", name: "PA cardiology", count: 2, preview: [], result: null }) });
    expect(actionEvent!.data.action).not.toHaveProperty("payload");
    expect(created).toHaveLength(0);

    const actionId = actionEvent!.data.action.id;
    expect((await call(other, "POST", `/actions/${actionId}/confirm`)).status).toBe(404);
    const ok = await call(me, "POST", `/actions/${actionId}/confirm`);
    expect(ok.status).toBe(200);
    expect(ok.body.action).toMatchObject({ status: "confirmed", result: { list_id: 501, member_count: 2 } });
    expect(created[0]).toMatchObject({ name: "PA cardiology", npis: ["1000000001", "1000000002"], createdBy: emailOf(me), filterCriteria: { source: "assistant", conversation_id: conv.id } });
    expect(audits[0]).toMatchObject({ action: "assistant_list_created", entity_id: 501, user_email: emailOf(me) });

    const again = await call(me, "POST", `/actions/${actionId}/confirm`);
    expect(again.status).toBe(409);
    expect(created).toHaveLength(1);
    expect((await call(me, "POST", `/actions/${actionId}/cancel`)).status).toBe(409);

    const view = (await call(me, "GET", `/conversations/${conv.id}`)).body;
    expect(view.turns[0].items.map((i: any) => i.type)).toEqual(["tool", "action", "text"]);
    expect(view.turns[0].items[1].action.status).toBe("confirmed");

    await call(me, "POST", `/conversations/${conv.id}/messages`, { text: "Did it work?" });
    const last = s.calls.at(-1)!.messages;
    expect(last.at(-1)).toMatchObject({ role: "system", content: [{ type: "text", text: expect.stringContaining("created as lead list 501 with 2 providers") }] });
    expect(store.actions[0].reported_at).not.toBeNull();
  });

  it("refuses an expired proposal and cancels a live one", async () => {
    const conv = (await call(me, "POST", "/conversations")).body.conversation;
    const turn = await store.startTurn(conv.id, "m", 0);
    const expired = await store.createAction({ conversationId: conv.id, turnId: turn!.id, userId: me, toolUseId: "t1", kind: "create_lead_list", payload: { name: "Old", npis: ["1"] }, expiresAt: new Date(Date.now() - 1000) });
    const live = await store.createAction({ conversationId: conv.id, turnId: turn!.id, userId: me, toolUseId: "t2", kind: "create_lead_list", payload: { name: "New", npis: ["1"] }, expiresAt: new Date(Date.now() + 60_000) });
    const res = await call(me, "POST", `/actions/${expired.id}/confirm`);
    expect(res.status).toBe(410);
    expect(res.body.action.status).toBe("expired");
    expect((await call(me, "POST", `/actions/${live.id}/cancel`)).body.action.status).toBe("cancelled");
    expect((await call(me, "POST", `/actions/${live.id}/confirm`)).status).toBe(409);
    expect((await call(me, "POST", "/actions/not-a-uuid/confirm")).status).toBe(404);
    expect(created).toHaveLength(0);
  });
});

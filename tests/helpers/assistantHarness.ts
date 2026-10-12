// Test doubles for the assistant: an in-memory store with the same semantics
// as the Postgres one, scripted model streams, and message builders.
import type { AssistantStore, ActionRow, ConversationRow, MessageRow, TurnRow, DecisionResult } from "../../server/lib/assistant/store";
import type { StreamFactory, StreamParams } from "../../server/lib/assistant/loop";

export function memoryAssistantStore(): AssistantStore & {
  conversations: ConversationRow[]; turns: TurnRow[]; messages: MessageRow[]; actions: ActionRow[]; usage: Map<number, number>;
} {
  const conversations: ConversationRow[] = [];
  const turns: TurnRow[] = [];
  const messages: MessageRow[] = [];
  const actions: ActionRow[] = [];
  const usage = new Map<number, number>();
  let ids = { conv: 1, turn: 1, msg: 1, action: 1 };
  const clone = <T,>(x: T): T => structuredClone(x);
  const nowIso = () => new Date().toISOString();

  const store = {
    conversations, turns, messages, actions, usage,
    async listConversations(userId: number, orgId: number | null, limit: number, before?: { updatedAt: string; id: number } | null) {
      const key = (c: ConversationRow) => [new Date(c.updated_at as any).getTime(), c.id] as const;
      const older = (c: ConversationRow) => {
        if (!before) return true;
        const [t, id] = key(c);
        const bt = new Date(before.updatedAt).getTime();
        return t < bt || (t === bt && id < before.id);
      };
      return conversations.filter((c) => c.user_id === userId && (c.org_id ?? null) === orgId && older(c))
        .sort((a, b) => key(b)[0] - key(a)[0] || b.id - a.id).slice(0, limit).map(clone);
    },
    async createConversation(userId: number, title?: string | null, orgId?: number | null) {
      const row = { id: ids.conv++, user_id: userId, org_id: orgId ?? null, title: title || null, created_at: nowIso(), updated_at: nowIso() };
      conversations.push(row);
      return clone(row);
    },
    async getConversation(id: number, userId: number, orgId: number | null) {
      return clone(conversations.find((c) => c.id === id && c.user_id === userId && (c.org_id ?? null) === orgId) ?? null);
    },
    async renameConversation(id: number, userId: number, orgId: number | null, title: string) {
      const c = conversations.find((x) => x.id === id && x.user_id === userId && (x.org_id ?? null) === orgId);
      if (!c) return null;
      c.title = title;
      return clone(c);
    },
    async deleteConversation(id: number, userId: number, orgId: number | null) {
      const i = conversations.findIndex((c) => c.id === id && c.user_id === userId && (c.org_id ?? null) === orgId);
      if (i === -1) return false;
      conversations.splice(i, 1);
      for (const list of [turns, messages, actions] as any[]) {
        for (let j = list.length - 1; j >= 0; j--) if (list[j].conversation_id === id) list.splice(j, 1);
      }
      return true;
    },
    async loadTranscript(conversationId: number) {
      return {
        turns: turns.filter((t) => t.conversation_id === conversationId).map(clone),
        messages: messages.filter((m) => m.conversation_id === conversationId).sort((a, b) => a.seq - b.seq).map(clone),
        actions: actions.filter((a) => a.conversation_id === conversationId).map(clone),
      };
    },
    async startTurn(conversationId: number, model: string) {
      const conv = conversations.find((c) => c.id === conversationId);
      if (!conv) return null;
      // One running turn per user, across their conversations.
      const mine = new Set(conversations.filter((c) => c.user_id === conv.user_id).map((c) => c.id));
      if (turns.some((t) => mine.has(t.conversation_id) && t.status === "running")) return null;
      const row: TurnRow = { id: ids.turn++, conversation_id: conversationId, status: "running", error: null, model, usage: null, created_at: nowIso(), finished_at: null };
      turns.push(row);
      return clone(row);
    },
    async interruptStaleTurns(conversationId: number, staleMs: number) {
      const cutoff = Date.now() - staleMs;
      let n = 0;
      for (const t of turns) {
        if (t.conversation_id === conversationId && t.status === "running" && new Date(t.created_at as any).getTime() < cutoff) {
          Object.assign(t, { status: "interrupted", error: "The server stopped before this answer finished.", finished_at: nowIso() });
          n++;
        }
      }
      return n;
    },
    async interruptTurn(conversationId: number, turnId: number, staleMs: number) {
      const t = turns.find((x) => x.id === turnId && x.conversation_id === conversationId);
      if (!t || t.status !== "running") return "not_running" as const;
      if (new Date(t.created_at as any).getTime() >= Date.now() - staleMs) return "still_active" as const;
      Object.assign(t, { status: "interrupted", error: "Marked as stopped.", finished_at: nowIso() });
      return "stopped" as const;
    },
    async countTurns(conversationId: number) {
      return turns.filter((t) => t.conversation_id === conversationId).length;
    },
    async appendMessage(conversationId: number, turnId: number, role: string, content: unknown[]) {
      if (!conversations.some((c) => c.id === conversationId)) throw new Error("conversation gone");
      const seq = Math.max(0, ...messages.filter((m) => m.conversation_id === conversationId).map((m) => m.seq)) + 1;
      messages.push({ id: ids.msg++, conversation_id: conversationId, turn_id: turnId, seq, role: role as any, content: clone(content) as any[] });
    },
    async finishTurn(turnId: number, status: string, error: string | null, u: unknown) {
      const t = turns.find((x) => x.id === turnId);
      if (t && t.status === "running") Object.assign(t, { status, error, usage: u, finished_at: nowIso() });
    },
    async touchConversation(id: number, titleIfUnset?: string | null) {
      const c = conversations.find((x) => x.id === id);
      if (c) Object.assign(c, { updated_at: nowIso(), title: c.title ?? titleIfUnset ?? null });
    },
    async createAction(input: any) {
      const row: ActionRow = {
        id: `00000000-0000-4000-8000-${String(ids.action++).padStart(12, "0")}`,
        conversation_id: input.conversationId, turn_id: input.turnId, user_id: input.userId, tool_use_id: input.toolUseId,
        kind: input.kind, payload: clone(input.payload), status: "proposed", result: null,
        expires_at: input.expiresAt.toISOString(), decided_at: null, reported_at: null, created_at: nowIso(),
      };
      actions.push(row);
      return clone(row);
    },
    async unreportedDecisions(conversationId: number) {
      return actions.filter((a) => a.conversation_id === conversationId && a.decided_at && !a.reported_at).map(clone);
    },
    async markReported(actionIds: string[]) {
      for (const a of actions) if (actionIds.includes(a.id)) a.reported_at = nowIso();
    },
    async confirmAction(actionId: string, userId: number, orgId: number | null, apply: (client: any, action: ActionRow) => Promise<unknown>): Promise<DecisionResult> {
      const a = actions.find((x) => x.id === actionId && x.user_id === userId);
      const conv = a ? conversations.find((c) => c.id === a.conversation_id) : undefined;
      if (!a || !conv || (conv.org_id ?? null) !== orgId) return { ok: false, reason: "not_found" };
      if (a.status !== "proposed") return { ok: false, reason: "already_decided", action: clone(a) };
      if (new Date(a.expires_at).getTime() <= Date.now()) return { ok: false, reason: "expired", action: clone(a) };
      const result = await apply({ fake: true }, clone(a));
      Object.assign(a, { status: "confirmed", decided_at: nowIso(), result });
      return { ok: true, action: clone(a) };
    },
    async cancelAction(actionId: string, userId: number, orgId: number | null): Promise<DecisionResult> {
      const a = actions.find((x) => x.id === actionId && x.user_id === userId);
      const conv = a ? conversations.find((c) => c.id === a.conversation_id) : undefined;
      if (!a || !conv || (conv.org_id ?? null) !== orgId) return { ok: false, reason: "not_found" };
      if (a.status !== "proposed") return { ok: false, reason: "already_decided", action: clone(a) };
      Object.assign(a, { status: "cancelled", decided_at: nowIso() });
      return { ok: true, action: clone(a) };
    },
    async usageToday(userId: number) {
      return usage.get(userId) || 0;
    },
    async addUsage(userId: number, units: number) {
      usage.set(userId, (usage.get(userId) || 0) + units);
    },
  };
  return store;
}

const USAGE = { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
let msgCounter = 0;

function message(content: any[], stop_reason: string, usage: Partial<typeof USAGE> = {}) {
  return {
    id: `msg_${++msgCounter}`, type: "message", role: "assistant", model: "test-model",
    content, stop_reason, stop_sequence: null, stop_details: null, usage: { ...USAGE, ...usage },
  };
}

export const text = (t: string, usage?: Partial<typeof USAGE>) => message([{ type: "text", text: t, citations: null }], "end_turn", usage);
export const toolCall = (calls: Array<{ id: string; name: string; input: unknown }>, opts: { note?: string; text?: string } = {}) => message([
  ...(opts.note ? [{ type: "thinking", thinking: opts.note, signature: "sig" }] : []),
  ...(opts.text ? [{ type: "text", text: opts.text, citations: null }] : []),
  ...calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input })),
], "tool_use");
export const withStop = (m: any, stop_reason: string) => ({ ...m, stop_reason });

/** What a scripted stream does: return a message, or throw while streaming. */
export type Step = any | { throw: unknown; partial?: string } | { hang: true; partial?: string; usage?: Record<string, number>; outputSoFar?: number };

function eventsFor(m: any): any[] {
  const out: any[] = [{ type: "message_start", message: { ...m, content: [], stop_reason: null } }];
  m.content.forEach((b: any, index: number) => {
    if (b.type === "text") {
      out.push({ type: "content_block_start", index, content_block: { type: "text", text: "", citations: null } });
      for (const piece of b.text.match(/.{1,12}/gs) || []) out.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: piece } });
    } else if (b.type === "thinking") {
      out.push({ type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } });
      out.push({ type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: b.thinking } });
    } else if (b.type === "tool_use") {
      out.push({ type: "content_block_start", index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
      out.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    }
    out.push({ type: "content_block_stop", index });
  });
  out.push({ type: "message_delta", delta: { stop_reason: m.stop_reason, stop_sequence: null }, usage: { output_tokens: m.usage.output_tokens } });
  out.push({ type: "message_stop" });
  return out;
}

/** A stream factory that plays `steps` in order, one per model call, recording each request. */
export function scriptedStreams(steps: Step[]): { factory: StreamFactory; calls: StreamParams[] } {
  const calls: StreamParams[] = [];
  const factory: StreamFactory = (params, signal) => {
    calls.push(structuredClone(params));
    const step = steps.shift();
    if (step === undefined) throw new Error("No scripted response left");
    let final: Promise<any>;
    return {
      async *[Symbol.asyncIterator]() {
        if (step && "throw" in step) {
          // Optionally stream some text first, like a mid-stream API failure.
          if (typeof (step as any).partial === "string" && (step as any).partial) {
            yield { type: "message_start", message: { id: "msg_part", type: "message", role: "assistant", content: [], usage: {} } } as any;
            yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: null } } as any;
            yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: (step as any).partial } } as any;
          }
          throw step.throw;
        }
        if (step && "hang" in step) {
          // What the API reports before the user stops it: input at the start,
          // output so far in a delta.
          if (step.usage) yield { type: "message_start", message: { id: "msg_hang", type: "message", role: "assistant", content: [], usage: step.usage } } as any;
          if (step.outputSoFar != null) yield { type: "message_delta", delta: {}, usage: { output_tokens: step.outputSoFar } } as any;
          if (step.partial) {
            yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: null } } as any;
            yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: step.partial } } as any;
          }
          await new Promise((_, reject) => {
            if (signal.aborted) reject(new Error("aborted"));
            signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          });
        }
        for (const ev of eventsFor(step)) {
          if (signal.aborted) throw new Error("aborted");
          yield ev;
        }
        final = Promise.resolve(step);
      },
      finalMessage() {
        return final ?? Promise.reject(new Error("stream not consumed"));
      },
    };
  };
  return { factory, calls };
}

// Turns stored conversation rows into (a) the history replayed to the model and
// (b) what the chat UI shows.
import type Anthropic from "@anthropic-ai/sdk";
import { toolLabel } from "./tools";
import type { ActionRow, MessageRow, TurnRow } from "./store";

export interface UiAction {
  id: string;
  kind: string;
  status: "proposed" | "confirmed" | "cancelled" | "expired";
  name: string;
  description: string | null;
  reason: string | null;
  count: number;
  preview: unknown[];
  expires_at: string | null;
  result: { list_id: number; name: string; member_count: number } | null;
}

export type UiItem =
  | { type: "text"; text: string }
  | { type: "progress"; text: string }
  | { type: "tool"; id: string; name: string; label: string; ok: boolean | null }
  | { type: "action"; action: UiAction };

export interface UiTurn {
  id: number;
  status: string;
  error: string | null;
  created_at: string | Date;
  question: string;
  items: UiItem[];
}

export function uiAction(a: { id: string; kind: string; status: string; payload: any; expires_at?: string | Date | null; expiresAt?: string | null; result?: any }, now = Date.now()): UiAction {
  const expires = a.expires_at ?? a.expiresAt ?? null;
  const expired = a.status === "proposed" && expires != null && new Date(expires).getTime() <= now;
  return {
    id: a.id,
    kind: a.kind,
    status: expired ? "expired" : (a.status as UiAction["status"]),
    name: a.payload?.name || "Untitled list",
    description: a.payload?.description || null,
    reason: a.payload?.reason || null,
    count: Array.isArray(a.payload?.npis) ? a.payload.npis.length : 0,
    preview: Array.isArray(a.payload?.preview) ? a.payload.preview : [],
    expires_at: expires ? new Date(expires).toISOString() : null,
    result: a.result || null,
  };
}

/** Messages of finished turns, exactly as stored, for the next request. */
export function replayHistory(turns: TurnRow[], messages: MessageRow[]): Anthropic.Beta.BetaMessageParam[] {
  const replayable = new Set(turns.filter((t) => t.status === "complete").map((t) => t.id));
  return messages
    .filter((m) => replayable.has(m.turn_id))
    .map((m) => ({ role: m.role, content: m.content }) as Anthropic.Beta.BetaMessageParam);
}

function textOf(content: any[]): string {
  return (content || []).filter((b) => b?.type === "text").map((b) => b.text).join("\n\n");
}

export function renderTranscript(turns: TurnRow[], messages: MessageRow[], actions: ActionRow[], now = Date.now()): UiTurn[] {
  const byTurn = new Map<number, MessageRow[]>();
  for (const m of messages) {
    const list = byTurn.get(m.turn_id) || [];
    list.push(m);
    byTurn.set(m.turn_id, list);
  }
  const actionByToolUse = new Map(actions.map((a) => [a.tool_use_id, a]));

  return turns.map((turn) => {
    const rows = byTurn.get(turn.id) || [];
    const items: UiItem[] = [];
    const tools = new Map<string, Extract<UiItem, { type: "tool" }>>();
    let question = "";
    rows.forEach((row, i) => {
      if (row.role === "system") return;
      if (row.role === "user") {
        if (i === 0) question = textOf(row.content);
        for (const b of row.content || []) {
          if (b?.type === "tool_result" && tools.has(b.tool_use_id)) tools.get(b.tool_use_id)!.ok = !b.is_error;
        }
        return;
      }
      for (const b of row.content || []) {
        if (b?.type === "text" && b.text) items.push({ type: "text", text: b.text });
        else if (b?.type === "thinking" && b.thinking) items.push({ type: "progress", text: b.thinking });
        else if (b?.type === "tool_use") {
          const item = { type: "tool" as const, id: b.id, name: b.name, label: toolLabel(b.name, b.input), ok: null };
          tools.set(b.id, item);
          items.push(item);
          const action = actionByToolUse.get(b.id);
          if (action) items.push({ type: "action", action: uiAction(action, now) });
        }
      }
    });
    return { id: turn.id, status: turn.status, error: turn.error, created_at: turn.created_at, question, items };
  });
}

/**
 * The system note telling the model what the user did with its proposals. It
 * names each proposal by the model's own tool call id and carries only numbers
 * the app produced: the list name came from the conversation, so it stays out
 * of a system-level message.
 */
export function decisionNote(actions: ActionRow[]): string | null {
  const ref = (a: ActionRow) => `the lead list you proposed in tool call ${String(a.tool_use_id || "").replace(/[^\w-]/g, "")}`;
  const lines = actions.map((a) => {
    if (a.status === "confirmed") {
      const listId = Number(a.result?.list_id);
      const members = Number(a.result?.member_count);
      if (!Number.isInteger(listId)) return `The user confirmed ${ref(a)}.`;
      return `The user confirmed ${ref(a)}: it was created as lead list ${listId} with ${Number.isFinite(members) ? members : "its"} providers (link: /LeadLists?list=${listId}).`;
    }
    if (a.status === "cancelled") return `The user cancelled ${ref(a)}; it was not created.`;
    return null;
  }).filter(Boolean);
  return lines.length ? `App update since your last answer: ${lines.join(" ")}` : null;
}

/** A conversation title from the first question. */
export function titleFrom(question: string): string {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}…` : oneLine || "New conversation";
}

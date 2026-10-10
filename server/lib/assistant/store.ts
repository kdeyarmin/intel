// Persistence for the assistant. Every query is scoped to the owner where a
// user is involved; routes never read another user's conversation.
import { randomUUID } from "node:crypto";

export interface ConversationRow {
  id: number;
  user_id: number;
  title: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface TurnRow {
  id: number;
  conversation_id: number;
  status: string;
  error: string | null;
  model: string | null;
  usage: unknown;
  created_at: string | Date;
  finished_at: string | Date | null;
}

export interface MessageRow {
  id: number;
  conversation_id: number;
  turn_id: number;
  seq: number;
  role: "user" | "assistant" | "system";
  content: any[];
}

export interface ActionRow {
  id: string;
  conversation_id: number;
  turn_id: number;
  user_id: number;
  tool_use_id: string;
  kind: string;
  payload: any;
  status: string;
  result: any;
  expires_at: string | Date;
  decided_at: string | Date | null;
  reported_at: string | Date | null;
  created_at: string | Date;
}

export type DecisionResult =
  | { ok: true; action: ActionRow }
  | { ok: false; reason: "not_found" | "already_decided" | "expired"; action?: ActionRow };

export interface NewAction {
  conversationId: number;
  turnId: number;
  userId: number;
  toolUseId: string;
  kind: string;
  payload: unknown;
  expiresAt: Date;
}

export interface AssistantStore {
  /** Newest first; `before` continues after the last row of the previous page. */
  listConversations(userId: number, limit: number, before?: { updatedAt: string; id: number } | null): Promise<ConversationRow[]>;
  createConversation(userId: number, title?: string | null): Promise<ConversationRow>;
  getConversation(id: number, userId: number): Promise<ConversationRow | null>;
  renameConversation(id: number, userId: number, title: string): Promise<ConversationRow | null>;
  deleteConversation(id: number, userId: number): Promise<boolean>;
  loadTranscript(conversationId: number): Promise<{ turns: TurnRow[]; messages: MessageRow[]; actions: ActionRow[] }>;
  /**
   * Starts a turn unless the user already has one running in any conversation
   * (stale ones count as interrupted), so one person's turns, and the usage
   * they spend, never overlap. Null when busy.
   */
  startTurn(conversationId: number, model: string, staleMs: number): Promise<TurnRow | null>;
  countTurns(conversationId: number): Promise<number>;
  appendMessage(conversationId: number, turnId: number, role: string, content: unknown[]): Promise<void>;
  finishTurn(turnId: number, status: string, error: string | null, usage: unknown): Promise<void>;
  touchConversation(id: number, titleIfUnset?: string | null): Promise<void>;
  createAction(input: NewAction): Promise<ActionRow>;
  /** Proposals the user decided on that the model hasn't been told about yet. */
  unreportedDecisions(conversationId: number): Promise<ActionRow[]>;
  markReported(actionIds: string[]): Promise<void>;
  /** Single use: locks the proposal, runs `apply` in the same transaction, then marks it confirmed. */
  confirmAction(actionId: string, userId: number, apply: (client: any, action: ActionRow) => Promise<unknown>): Promise<DecisionResult>;
  cancelAction(actionId: string, userId: number): Promise<DecisionResult>;
  usageToday(userId: number): Promise<number>;
  addUsage(userId: number, units: number): Promise<void>;
}

export function createPgAssistantStore(pool: any): AssistantStore {
  const q = async (text: string, values: unknown[] = []) => (await pool.query(text, values)).rows;

  async function decide(actionId: string, userId: number): Promise<ActionRow | undefined> {
    return (await q("SELECT * FROM assistant_actions WHERE id = $1 AND user_id = $2", [actionId, userId]))[0];
  }

  return {
    listConversations: (userId, limit, before) => before
      ? q(`SELECT id, user_id, title, created_at, updated_at FROM assistant_conversations
            WHERE user_id = $1 AND (updated_at, id) < ($3::timestamptz, $4) ORDER BY updated_at DESC, id DESC LIMIT $2`, [userId, limit, before.updatedAt, before.id])
      : q("SELECT id, user_id, title, created_at, updated_at FROM assistant_conversations WHERE user_id = $1 ORDER BY updated_at DESC, id DESC LIMIT $2", [userId, limit]),

    async createConversation(userId, title) {
      return (await q("INSERT INTO assistant_conversations (user_id, title) VALUES ($1, $2) RETURNING *", [userId, title || null]))[0];
    },

    async getConversation(id, userId) {
      return (await q("SELECT * FROM assistant_conversations WHERE id = $1 AND user_id = $2", [id, userId]))[0] || null;
    },

    async renameConversation(id, userId, title) {
      return (await q("UPDATE assistant_conversations SET title = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *", [id, userId, title]))[0] || null;
    },

    async deleteConversation(id, userId) {
      return (await q("DELETE FROM assistant_conversations WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId])).length > 0;
    },

    async loadTranscript(conversationId) {
      const [turns, messages, actions] = await Promise.all([
        q("SELECT * FROM assistant_turns WHERE conversation_id = $1 ORDER BY id", [conversationId]),
        q("SELECT id, conversation_id, turn_id, seq, role, content FROM assistant_messages WHERE conversation_id = $1 ORDER BY seq", [conversationId]),
        q("SELECT * FROM assistant_actions WHERE conversation_id = $1 ORDER BY created_at", [conversationId]),
      ]);
      return { turns, messages, actions };
    },

    async startTurn(conversationId, model, staleMs) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const conv = await client.query("SELECT id, user_id FROM assistant_conversations WHERE id = $1", [conversationId]);
        if (!conv.rows.length) {
          await client.query("ROLLBACK");
          return null;
        }
        const userId = conv.rows[0].user_id;
        // Serialises turn starts for this user across requests and processes.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('assistant_user_turn:' || $1))", [String(userId)]);
        await client.query(
          `UPDATE assistant_turns SET status = 'interrupted', finished_at = now(), error = 'The server stopped before this answer finished.'
            WHERE conversation_id IN (SELECT id FROM assistant_conversations WHERE user_id = $1)
              AND status = 'running' AND created_at < now() - ($2 || ' milliseconds')::interval`,
          [userId, String(staleMs)],
        );
        const running = await client.query(
          `SELECT 1 FROM assistant_turns WHERE status = 'running'
              AND conversation_id IN (SELECT id FROM assistant_conversations WHERE user_id = $1) LIMIT 1`,
          [userId],
        );
        if (running.rows.length) {
          await client.query("ROLLBACK");
          return null;
        }
        const { rows } = await client.query("INSERT INTO assistant_turns (conversation_id, model) VALUES ($1, $2) RETURNING *", [conversationId, model]);
        await client.query("COMMIT");
        return rows[0];
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },

    async countTurns(conversationId) {
      return Number((await q("SELECT count(*)::int AS n FROM assistant_turns WHERE conversation_id = $1", [conversationId]))[0]?.n || 0);
    },

    async appendMessage(conversationId, turnId, role, content) {
      await q(
        `INSERT INTO assistant_messages (conversation_id, turn_id, seq, role, content)
         SELECT $1, $2, COALESCE(MAX(seq), 0) + 1, $3, $4::jsonb FROM assistant_messages WHERE conversation_id = $1`,
        [conversationId, turnId, role, JSON.stringify(content)],
      );
    },

    async finishTurn(turnId, status, error, usage) {
      await q("UPDATE assistant_turns SET status = $2, error = $3, usage = $4::jsonb, finished_at = now() WHERE id = $1", [turnId, status, error, JSON.stringify(usage ?? null)]);
    },

    async touchConversation(id, titleIfUnset) {
      await q("UPDATE assistant_conversations SET updated_at = now(), title = COALESCE(title, $2) WHERE id = $1", [id, titleIfUnset || null]);
    },

    async createAction(input) {
      const id = randomUUID();
      return (await q(
        `INSERT INTO assistant_actions (id, conversation_id, turn_id, user_id, tool_use_id, kind, payload, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) RETURNING *`,
        [id, input.conversationId, input.turnId, input.userId, input.toolUseId, input.kind, JSON.stringify(input.payload), input.expiresAt],
      ))[0];
    },

    unreportedDecisions: (conversationId) =>
      q("SELECT * FROM assistant_actions WHERE conversation_id = $1 AND decided_at IS NOT NULL AND reported_at IS NULL ORDER BY decided_at", [conversationId]),

    async markReported(actionIds) {
      if (actionIds.length) await q("UPDATE assistant_actions SET reported_at = now() WHERE id = ANY($1)", [actionIds]);
    },

    async confirmAction(actionId, userId, apply) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query("SELECT * FROM assistant_actions WHERE id = $1 AND user_id = $2 FOR UPDATE", [actionId, userId]);
        const action: ActionRow | undefined = rows[0];
        let failure: DecisionResult | null = null;
        if (!action) failure = { ok: false, reason: "not_found" };
        else if (action.status !== "proposed") failure = { ok: false, reason: "already_decided", action };
        else if (new Date(action.expires_at).getTime() <= Date.now()) failure = { ok: false, reason: "expired", action };
        if (failure) {
          await client.query("ROLLBACK");
          return failure;
        }
        const result = await apply(client, action!);
        const updated = await client.query(
          "UPDATE assistant_actions SET status = 'confirmed', decided_at = now(), result = $2::jsonb WHERE id = $1 RETURNING *",
          [actionId, JSON.stringify(result ?? null)],
        );
        await client.query("COMMIT");
        return { ok: true, action: updated.rows[0] };
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },

    async cancelAction(actionId, userId) {
      const rows = await q(
        "UPDATE assistant_actions SET status = 'cancelled', decided_at = now() WHERE id = $1 AND user_id = $2 AND status = 'proposed' RETURNING *",
        [actionId, userId],
      );
      if (rows[0]) return { ok: true, action: rows[0] };
      const existing = await decide(actionId, userId);
      return existing ? { ok: false, reason: "already_decided", action: existing } : { ok: false, reason: "not_found" };
    },

    async usageToday(userId) {
      return Number((await q("SELECT units FROM assistant_usage WHERE user_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date", [userId]))[0]?.units || 0);
    },

    async addUsage(userId, units) {
      await q(
        `INSERT INTO assistant_usage (user_id, day, units, requests) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, $2, 1)
         ON CONFLICT (user_id, day) DO UPDATE SET units = assistant_usage.units + EXCLUDED.units, requests = assistant_usage.requests + 1`,
        [userId, Math.max(0, Math.round(units))],
      );
    },
  };
}

// /api/assistant: the AI Assistant's conversations (owner-only), the streamed
// answer to each question (server-sent events), and confirming or cancelling
// the lead lists it proposes.
import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { clientIp } from "../middleware/rateLimit";
import type { AuditWriter } from "../lib/audit";
import type { CreatedLeadList } from "../lib/leadLists";
import { ASSISTANT_CONFIG } from "../lib/assistant/config";
import { runAssistantTurn, usageUnits, type StreamFactory, type TurnResult } from "../lib/assistant/loop";
import { checkQuota } from "../lib/assistant/quota";
import { decisionNote, renderTranscript, replayHistory, titleFrom, uiAction } from "../lib/assistant/render";
import { openSse } from "../lib/assistant/sse";
import type { AssistantStore, DecisionResult } from "../lib/assistant/store";
import type { ToolDeps } from "../lib/assistant/tools";

export interface AssistantRouterDeps {
  store: AssistantStore;
  toolDeps: ToolDeps;
  /** Null when no Anthropic credentials are configured. */
  createStream: () => StreamFactory | null;
  createLeadList: (client: any, input: { name: string; description: string | null; npis: string[]; createdBy: string; filterCriteria: Record<string, unknown>; orgId: number }) => Promise<CreatedLeadList>;
  audit: AuditWriter;
  now?: () => number;
}

function parseId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}

const CONVERSATION_PAGE = 50;

const NOT_CONFIGURED = {
  code: "assistant_not_configured",
  message: "The AI Assistant isn't set up on this server. An admin needs to set ANTHROPIC_API_KEY.",
};

export function createAssistantRouter(deps: AssistantRouterDeps) {
  const router = Router();
  const { store } = deps;
  const now = deps.now ?? Date.now;
  router.use(authMiddleware);

  async function ownConversation(req: AuthRequest, res: Response) {
    const id = parseId(String(req.params.id));
    const conv = id == null ? null : await store.getConversation(id, req.user!.id);
    if (!conv) res.status(404).json({ message: "Conversation not found" });
    return conv;
  }

  router.get("/status", async (req: AuthRequest, res: Response) => {
    const usedToday = await store.usageToday(req.user!.id);
    res.json({
      configured: deps.createStream() != null,
      model: ASSISTANT_CONFIG.model,
      daily_budget: ASSISTANT_CONFIG.dailyTokenBudget,
      used_today: usedToday,
      max_turns: ASSISTANT_CONFIG.maxTurnsPerConversation,
    });
  });

  // A page at a time, newest first; next_cursor fetches the older ones.
  router.get("/conversations", async (req: AuthRequest, res: Response) => {
    const raw = typeof req.query.before === "string" ? req.query.before : "";
    const m = raw.match(/^(.+)~(\d{1,9})$/);
    const before = m && !Number.isNaN(Date.parse(m[1])) ? { updatedAt: m[1], id: Number(m[2]) } : null;
    if (raw && !before) return res.status(400).json({ message: "Invalid cursor." });
    const rows = await store.listConversations(req.user!.id, CONVERSATION_PAGE + 1, before);
    const page = rows.slice(0, CONVERSATION_PAGE);
    const last = page[page.length - 1];
    const lastAt = last ? new Date(last.updated_at as any).toISOString() : null;
    res.json({ conversations: page, next_cursor: rows.length > CONVERSATION_PAGE && last ? `${lastAt}~${last.id}` : null });
  });

  router.post("/conversations", async (req: AuthRequest, res: Response) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : null;
    res.status(201).json({ conversation: await store.createConversation(req.user!.id, title || null) });
  });

  router.get("/conversations/:id", async (req: AuthRequest, res: Response) => {
    const conv = await ownConversation(req, res);
    if (!conv) return;
    const { turns, messages, actions } = await store.loadTranscript(conv.id);
    res.json({
      conversation: conv,
      turns: renderTranscript(turns, messages, actions, now()),
      running: turns.some((t) => t.status === "running"),
    });
  });

  router.patch("/conversations/:id", async (req: AuthRequest, res: Response) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title || title.length > 200) return res.status(400).json({ message: "Give the conversation a name of up to 200 characters." });
    const id = parseId(String(req.params.id));
    const conv = id == null ? null : await store.renameConversation(id, req.user!.id, title);
    if (!conv) return res.status(404).json({ message: "Conversation not found" });
    res.json({ conversation: conv });
  });

  router.delete("/conversations/:id", async (req: AuthRequest, res: Response) => {
    const id = parseId(String(req.params.id));
    if (id == null || !(await store.deleteConversation(id, req.user!.id))) return res.status(404).json({ message: "Conversation not found" });
    res.status(204).end();
  });

  router.post("/conversations/:id/messages", async (req: AuthRequest, res: Response) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ message: "Type a question first." });
    if (text.length > ASSISTANT_CONFIG.maxUserMessageChars) {
      return res.status(400).json({ message: `Questions can be up to ${ASSISTANT_CONFIG.maxUserMessageChars.toLocaleString("en-US")} characters.` });
    }
    const conv = await ownConversation(req, res);
    if (!conv) return;
    const createStream = deps.createStream();
    if (!createStream) return res.status(503).json(NOT_CONFIGURED);
    if ((await store.countTurns(conv.id)) >= ASSISTANT_CONFIG.maxTurnsPerConversation) {
      return res.status(409).json({ code: "conversation_full", message: `This conversation has reached ${ASSISTANT_CONFIG.maxTurnsPerConversation} questions. Start a new conversation to continue.` });
    }
    const user = req.user!;
    const quota = await checkQuota(store, user.id, new Date(now()));
    if (!quota.ok) {
      res.setHeader("Retry-After", String(quota.retryAfterSec));
      return res.status(quota.status).json({ code: "assistant_quota", message: quota.message });
    }
    const turn = await store.startTurn(conv.id, ASSISTANT_CONFIG.model, ASSISTANT_CONFIG.staleTurnMs);
    if (!turn) return res.status(409).json({ code: "turn_running", message: "The assistant is still answering one of your questions. Wait for it to finish, then ask again." });

    const controller = new AbortController();
    const sse = openSse(res, ASSISTANT_CONFIG.heartbeatMs);
    let finished = false;
    let timedOut = false;
    // A closed connection (the user pressed Stop or left) ends the turn.
    res.on("close", () => {
      if (!finished) controller.abort();
    });
    const hardStop = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ASSISTANT_CONFIG.hardStopMs);
    hardStop.unref?.();
    sse.send("turn", { turn_id: turn.id, conversation_id: conv.id });

    let result: TurnResult;
    let decisions: Awaited<ReturnType<AssistantStore["unreportedDecisions"]>> = [];
    try {
      const transcript = await store.loadTranscript(conv.id);
      decisions = await store.unreportedDecisions(conv.id);
      result = await runAssistantTurn({
        history: replayHistory(transcript.turns, transcript.messages),
        userContent: [{ type: "text", text }],
        systemNote: decisionNote(decisions),
        createStream,
        persist: (role, content) => store.appendMessage(conv.id, turn.id, role, content),
        emit: (event, data) => sse.send(event, data),
        toolContext: { userId: user.id, user, conversationId: conv.id, turnId: turn.id, deps: deps.toolDeps },
        signal: controller.signal,
        onUsage: (u) => store.addUsage(user.id, usageUnits(u)),
        // Each further model call re-checks the daily budget.
        beforeRequest: async () => ((await store.usageToday(user.id)) >= ASSISTANT_CONFIG.dailyTokenBudget
          ? "You've reached today's assistant usage limit, so this answer stopped early. It resets at midnight UTC."
          : null),
      });
    } catch (e: any) {
      console.error("[assistant] turn failed:", e?.message || e);
      result = { status: "error", error: "The assistant ran into a problem. Try again.", usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, requests: 0 }, rounds: 0 };
    } finally {
      finished = true;
      clearTimeout(hardStop);
    }
    if (timedOut && result.status === "interrupted") {
      result = { ...result, status: "error", error: "This answer took too long and was stopped. Try a narrower question." };
    }
    try {
      await store.finishTurn(turn.id, result.status, result.error ?? null, result.usage);
      if (result.status === "complete" && decisions.length) await store.markReported(decisions.map((d) => d.id));
      await store.touchConversation(conv.id, titleFrom(text));
    } catch (e: any) {
      console.error("[assistant] failed to record the turn:", e?.message || e);
    }
    sse.send("done", { turn_id: turn.id, status: result.status, error: result.error ?? null });
    sse.close();
  });

  function sendDecision(res: Response, result: DecisionResult) {
    if (result.ok) return res.json({ action: uiAction(result.action, now()) });
    if (result.reason === "not_found") return res.status(404).json({ message: "That proposal wasn't found." });
    if (result.reason === "expired") return res.status(410).json({ message: "This proposal has expired. Ask the assistant to propose the list again.", action: result.action ? uiAction(result.action, now()) : null });
    return res.status(409).json({ message: "This proposal was already handled.", action: result.action ? uiAction(result.action, now()) : null });
  }

  router.post("/actions/:id/confirm", async (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const actionId = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(actionId)) return res.status(404).json({ message: "That proposal wasn't found." });
    try {
      if (user.orgId == null) return res.status(403).json({ message: "Your account isn't part of an organization yet, so it has no place to keep a lead list." });
      const orgId = user.orgId;
      const result = await store.confirmAction(actionId, user.id, async (client, action) => {
        const p = action.payload || {};
        const created = await deps.createLeadList(client, {
          orgId,
          name: p.name,
          description: p.description || null,
          npis: Array.isArray(p.npis) ? p.npis : [],
          createdBy: user.email,
          filterCriteria: { source: "assistant", conversation_id: action.conversation_id, reason: p.reason || null },
        });
        return { list_id: created.id, name: created.name, member_count: created.memberCount };
      });
      if (result.ok) {
        await deps.audit({
          event_type: "user_action",
          user_email: user.email,
          action: "assistant_list_created",
          entity_type: "LeadList",
          entity_id: result.action.result?.list_id ?? null,
          details: { proposal_id: actionId, members: result.action.result?.member_count ?? 0 },
          ip_address: clientIp(req),
          org_id: user.orgId,
        });
      }
      sendDecision(res, result);
    } catch (e: any) {
      console.error("[assistant] confirm failed:", e?.message || e);
      res.status(500).json({ message: "The list couldn't be created. Try again." });
    }
  });

  router.post("/actions/:id/cancel", async (req: AuthRequest, res: Response) => {
    const actionId = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(actionId)) return res.status(404).json({ message: "That proposal wasn't found." });
    sendDecision(res, await store.cancelAction(actionId, req.user!.id));
  });

  return router;
}

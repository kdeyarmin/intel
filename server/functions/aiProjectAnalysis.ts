// Port of base44/functions/aiProjectAnalysis/entry.ts —
// AI Project Manager: assigns tasks, analyzes timelines/bottlenecks, and
// recommends resource allocation, driven by campaign tasks + team members.
// Triggered manually from the frontend (actions: 'assign' | 'analyze' | 'resource').
//
// Paused behavior: the Base44 original short-circuits on its first line,
// returning { error: "AI integrations paused to save credits" } before auth,
// DB reads, or the LLM call. This port preserves that as the default; set
// AI_FEATURES_ENABLED=true to run the real path (Drizzle reads + Anthropic).
//
// Auth: the original called base44.auth.me() (which throws under service
// role); the router's authMiddleware already authenticated the caller, so the
// `user` param (req.user) replaces it and is required → 401 when absent.
// DB: the original read as service role (full, unscoped lists). The port reads
// the local Postgres tables directly via Drizzle, same unscoped shape.
// LLM: integrations.Core.InvokeLLM(prompt, response_json_schema) → Anthropic
// SDK, following the in-repo aiStrategy pattern (server/functions/outreach.ts).
//
// Schema drift note: the Base44 CampaignTask entity carried a `type` field.
// The Postgres schema (server/db/schema.ts → campaign_tasks) has no `type`
// column, so it is omitted from the simplified task payload. If it is needed,
// add a migration for campaign_tasks.type and re-add it to the select below.

import { db } from "../db";
import { campaignTasks, users } from "../db/schema";
import { CLAUDE_MODELS } from "../lib/aiModels";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Today's production behavior: the integration is paused to save credits. */
function pausedPayload() {
  return { error: "AI integrations paused to save credits" };
}

function stripCodeFences(text: string): string {
  const m = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1].trim() : text;
}

/**
 * InvokeLLM replacement: ask Claude for JSON matching the original
 * response_json_schema. Returns the raw text, or null when the call is
 * skipped/failed (the caller falls back gracefully).
 */
async function invokeClaudeJson(prompt: string, schema: Record<string, unknown>): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[aiProjectAnalysis] ANTHROPIC_API_KEY not set; skipping LLM call");
    return null;
  }
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await anthropic.messages.create({
      model: CLAUDE_MODELS.HAIKU,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content:
            `${prompt}\n\n` +
            `Return ONLY valid JSON matching this schema (no markdown fences, no prose):\n` +
            JSON.stringify(schema),
        },
      ],
    });
    const block = res.content.find((b: any) => b.type === "text") as any;
    return block?.text?.trim() || null;
  } catch (e: any) {
    console.warn("[aiProjectAnalysis] LLM call failed:", e?.message);
    return null;
  }
}

export async function handleAiProjectAnalysis(payload: any, user?: any): Promise<any> {
  // Preserve the original's first-line short-circuit: while AI is paused the
  // function returns before auth, DB reads, or the LLM call — exactly like
  // the Base44 version does today.
  if (process.env.AI_FEATURES_ENABLED !== "true") {
    return pausedPayload();
  }

  // Replaces base44.auth.me(): the router's authMiddleware authenticated the caller.
  if (!user) throw new HttpError(401, "Unauthorized");

  const action = payload?.action; // 'assign' | 'analyze' | 'resource'

  // Service-role equivalent: full, unscoped reads of the local tables.
  // Users are projected to { email, role, full_name } — never password_hash.
  const taskRows = await db
    .select({
      id: campaignTasks.id,
      title: campaignTasks.title,
      status: campaignTasks.status,
      priority: campaignTasks.priority,
      assigned_to: campaignTasks.assigned_to,
      due_date: campaignTasks.due_date,
    })
    .from(campaignTasks);
  const userRows = await db
    .select({ email: users.email, role: users.role, full_name: users.full_name })
    .from(users);

  const simplifiedTasks = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assigned_to: t.assigned_to,
    due_date: t.due_date,
  }));
  const simplifiedUsers = userRows.map((u) => ({
    email: u.email,
    role: u.role,
    full_name: u.full_name,
  }));

  let prompt = "";
  let schema: Record<string, unknown> = {};

  if (action === "assign") {
    prompt = `You are an AI Project Manager. Given the following team members and the following tasks (some might be unassigned or unevenly distributed), intelligently assign unassigned tasks or re-assign them to optimize workload based on roles.
Tasks: ${JSON.stringify(simplifiedTasks)}
Users: ${JSON.stringify(simplifiedUsers)}
Return a list of suggested assignments with reasoning. ONLY reassign if necessary or if task is unassigned.`;

    schema = {
      type: "object",
      properties: {
        assignments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              taskId: { type: "string" },
              assigneeEmail: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
      },
    };
  } else if (action === "analyze") {
    prompt = `You are an AI Project Manager. Analyze the current project timelines and potential bottlenecks based on these tasks: ${JSON.stringify(simplifiedTasks)}. Focus on overdue tasks, high priority tasks, and overall progress.`;
    schema = {
      type: "object",
      properties: {
        analysis: { type: "string" },
        bottlenecks: {
          type: "array",
          items: { type: "string" },
        },
        estimatedCompletion: { type: "string" },
        riskLevel: { type: "string", enum: ["Low", "Medium", "High"] },
      },
    };
  } else if (action === "resource") {
    prompt = `You are an AI Project Manager. Provide intelligent resource allocation recommendations to optimize delivery for these tasks: ${JSON.stringify(simplifiedTasks)} and team members: ${JSON.stringify(simplifiedUsers)}. Identify who is overloaded, who is underutilized, and how to improve.`;
    schema = {
      type: "object",
      properties: {
        recommendations: {
          type: "array",
          items: { type: "string" },
        },
        optimizationStrategy: { type: "string" },
        overloadedMembers: { type: "array", items: { type: "string" } },
        underutilizedMembers: { type: "array", items: { type: "string" } },
      },
    };
  } else {
    throw new HttpError(400, "Invalid action");
  }

  const text = await invokeClaudeJson(prompt, schema);
  if (text == null) {
    return { error: "AI analysis is temporarily unavailable. Please try again later." };
  }

  // Ensure we parse the response if it comes back as a string (original logic preserved verbatim).
  let result: any = text;
  try {
    result = JSON.parse(stripCodeFences(text));
  } catch {
    // If it fails to parse, wrap it in an object matching the schema loosely.
    if (action === "analyze") result = { analysis: text, bottlenecks: [], riskLevel: "Medium" };
    else if (action === "resource") result = { recommendations: [text], optimizationStrategy: text };
    else if (action === "assign") result = { assignments: [] };
  }

  return result;
}

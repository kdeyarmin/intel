// Limits and request settings for the AI Assistant. Spend is bounded per turn
// (tool rounds, time), per user (requests per minute, a daily token budget) and
// per conversation (one turn at a time, a maximum number of turns).
import { CLAUDE_MODELS } from "../aiModels";

function envInt(name: string, fallback: number): number {
  const n = Math.floor(Number(process.env[name]));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

function envEffort(): Effort {
  const v = process.env.ASSISTANT_EFFORT;
  return (EFFORTS as readonly string[]).includes(v || "") ? (v as Effort) : "medium";
}

export const ASSISTANT_CONFIG = {
  model: CLAUDE_MODELS.ASSISTANT,
  // Chat with data lookups; medium is this model's default, set explicitly.
  effort: envEffort(),
  // Thinking counts toward max_tokens, so leave room for it as well as the reply.
  maxTokens: 64000,
  // Model calls per turn that may use tools; one more call without tools follows if they run out.
  maxToolRounds: 8,
  // No new model call starts after this; the turn is cut off at hardStopMs.
  turnBudgetMs: 90_000,
  hardStopMs: 150_000,
  heartbeatMs: 15_000,
  maxUserMessageChars: 8000,
  maxTurnsPerConversation: envInt("ASSISTANT_MAX_TURNS", 40),
  requestsPerMinute: envInt("ASSISTANT_REQUESTS_PER_MINUTE", 6),
  // Token units per user per UTC day: input + cache writes + output + a tenth of cache reads.
  dailyTokenBudget: envInt("ASSISTANT_DAILY_TOKEN_BUDGET", 1_000_000),
  // Tool results above this many characters are cut, with a note saying so.
  toolResultMaxChars: 12_000,
  maxProposalNpis: 1000,
  proposalTtlMs: 24 * 60 * 60 * 1000,
  // A turn still "running" after this long is treated as interrupted (crashed process).
  staleTurnMs: 10 * 60 * 1000,
  betas: [
    // fallbacks: "default" — a declined request is retried on the model
    // Anthropic recommends for that refusal category.
    "server-side-fallback-2026-07-01",
    // thinking.display "updates": short progress notes between tool calls.
    "thinking-display-updates-2026-08-18",
    // block_binding: if the system prompt or tools change in a deploy, older
    // thinking blocks are dropped instead of failing the request.
    "thinking-binding-controls-2026-08-01",
  ],
} as const;

export function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

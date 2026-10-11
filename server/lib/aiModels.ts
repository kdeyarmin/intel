/**
 * Centralized Claude model selection.
 *
 * Choose the model based on the workload:
 *   - SONNET    → conversational helpers, multi-step reasoning, low-volume analysis where quality matters most
 *   - HAIKU     → high-volume bulk enrichment, structured JSON extraction, batch worker loops
 *   - OPUS      → reserved for the hardest reasoning tasks (currently unused)
 *   - ASSISTANT → the in-app AI Assistant (server/lib/assistant). It streams,
 *                 uses tools, adaptive thinking, effort and server-side refusal
 *                 fallback, so an override must be a model that supports those.
 *                 It is deliberately not callable through /api/integrations/ai/invoke.
 *
 * Override at runtime via env vars (CLAUDE_MODEL_SONNET / CLAUDE_MODEL_HAIKU /
 * CLAUDE_MODEL_OPUS / CLAUDE_MODEL_ASSISTANT) so model upgrades can be rolled
 * out without a code change.
 */
export const CLAUDE_MODELS = {
  SONNET: process.env.CLAUDE_MODEL_SONNET || "claude-sonnet-4-6",
  HAIKU: process.env.CLAUDE_MODEL_HAIKU || "claude-haiku-4-5-20251001",
  OPUS: process.env.CLAUDE_MODEL_OPUS || "claude-opus-4-7",
  ASSISTANT: process.env.CLAUDE_MODEL_ASSISTANT || "claude-opus-5-5",
} as const;

export type ClaudeModelName = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS];

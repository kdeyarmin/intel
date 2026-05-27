/**
 * Centralized Claude model selection.
 *
 * As of April 2026 the current generation Anthropic models are:
 *   - claude-opus-4-7              (most capable, expensive — heaviest reasoning)
 *   - claude-sonnet-4-6            (balanced flagship — analysis, conversation, structured output)
 *   - claude-haiku-4-5-20251001    (fast & cheap — bulk lookups, high-volume structured tasks)
 *
 * Choose the model based on the workload:
 *   - SONNET   → conversational assistants, multi-step reasoning, low-volume analysis where quality matters most
 *   - HAIKU    → high-volume bulk enrichment, structured JSON extraction, batch worker loops
 *   - OPUS     → reserved for the hardest reasoning tasks (currently unused)
 *
 * Override at runtime via env vars (CLAUDE_MODEL_SONNET / CLAUDE_MODEL_HAIKU / CLAUDE_MODEL_OPUS)
 * so model upgrades can be rolled out without a code change.
 */
export const CLAUDE_MODELS = {
  SONNET: process.env.CLAUDE_MODEL_SONNET || "claude-sonnet-4-6",
  HAIKU: process.env.CLAUDE_MODEL_HAIKU || "claude-haiku-4-5-20251001",
  OPUS: process.env.CLAUDE_MODEL_OPUS || "claude-opus-4-7",
} as const;

export type ClaudeModelName = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS];

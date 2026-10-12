// One assistant turn: stream the model, run the tools it asks for, repeat until
// it answers. Everything sent to or received from the API is persisted
// verbatim and in order (append-only), so later turns replay it unchanged and
// thinking blocks stay valid. A turn that doesn't finish cleanly is kept for
// display but never replayed.
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";
import { ASSISTANT_CONFIG } from "./config";
import { SYSTEM_PROMPT } from "./prompt";
import { ASSISTANT_TOOLS, runTool, toolLabel, type ToolContext } from "./tools";
import { uiAction } from "./render";

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;
type Message = Anthropic.Beta.BetaMessage;
type StreamEvent = Anthropic.Beta.BetaRawMessageStreamEvent;
export type StreamParams = BetaMessageStreamParams;

/** What the loop needs from a message stream (the SDK's BetaMessageStream, or a test fake). */
export interface TurnStream extends AsyncIterable<StreamEvent> {
  finalMessage(): Promise<Message>;
}

export type StreamFactory = (params: StreamParams, signal: AbortSignal) => TurnStream;

export type TurnStatus = "complete" | "interrupted" | "refused" | "retryable" | "error";

export interface TurnUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  requests: number;
  /** How many times the request was re-issued after a mid-stream failure; each attempt was billed. */
  retries: number;
}

export interface TurnResult {
  status: TurnStatus;
  error?: string;
  usage: TurnUsage;
  rounds: number;
}

export interface RunTurnInput {
  /** Earlier complete turns, exactly as persisted. */
  history: MessageParam[];
  userContent: ContentBlockParam[];
  /**
   * App news since the last turn (a proposal confirmed or cancelled), sent as a
   * system message after the user's question rather than as words the user said.
   */
  systemNote?: string | null;
  createStream: StreamFactory;
  /** Appends one message to the conversation's stored history. */
  persist: (role: "user" | "assistant" | "system", content: unknown[]) => Promise<void>;
  emit: (event: string, data: Record<string, unknown>) => void;
  toolContext: Omit<ToolContext, "toolUseId">;
  signal: AbortSignal;
  onUsage?: (usage: Anthropic.Beta.BetaUsage) => Promise<void> | void;
  /**
   * Checked before every model request after the first (the route checks the
   * first): a message stops the turn there, e.g. the daily budget ran out.
   */
  beforeRequest?: () => Promise<string | null>;
  now?: () => number;
  config?: Partial<Pick<typeof ASSISTANT_CONFIG, "maxToolRounds" | "turnBudgetMs">>;
}

/** Token units charged against the daily budget for one response. */
export function usageUnits(u: Partial<Anthropic.Beta.BetaUsage> | null | undefined): number {
  if (!u) return 0;
  return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0) + Math.ceil((u.cache_read_input_tokens || 0) / 10);
}

export function buildParams(messages: MessageParam[], opts: { final: boolean }): StreamParams {
  return {
    model: ASSISTANT_CONFIG.model,
    max_tokens: ASSISTANT_CONFIG.maxTokens,
    system: SYSTEM_PROMPT,
    tools: ASSISTANT_TOOLS,
    messages,
    thinking: { type: "adaptive", display: "updates", block_binding: { prefix_mismatch_behavior: "drop_block" } },
    output_config: { effort: ASSISTANT_CONFIG.effort },
    // Caches everything up to the last block; each round extends the prefix.
    cache_control: { type: "ephemeral" },
    fallbacks: "default",
    betas: [...ASSISTANT_CONFIG.betas],
    // Out of tool rounds or time: the model must answer with what it has.
    ...(opts.final ? { tool_choice: { type: "none" as const } } : {}),
  };
}

/** A user-facing sentence for a failed API call. */
export function apiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return "The AI service rejected the assistant's credentials. An admin needs to check ANTHROPIC_API_KEY.";
  }
  if (e instanceof Anthropic.RateLimitError) return "The AI service is rate-limiting requests right now. Try again in a minute.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Try again shortly.";
  if (e instanceof Anthropic.APIError && Number(e.status) >= 500) return "The AI service is busy or unavailable. Try again shortly.";
  if (e instanceof Anthropic.BadRequestError) return "The AI service couldn't process this conversation. Start a new conversation and try again.";
  return "The assistant ran into a problem. Try again.";
}

function zeroUsage(): TurnUsage {
  return { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, requests: 0, retries: 0 };
}

/** Mid-stream failures worth retrying later: rate limits, dropped connections, 5xx. Auth, permission and bad-request failures are not. */
function isRetryableApiError(e: unknown): boolean {
  if (e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.RateLimitError) return true;
  return e instanceof Anthropic.APIError && Number(e.status) >= 500;
}

const MAX_JSON_RETRIES = 2;

export async function runAssistantTurn(input: RunTurnInput): Promise<TurnResult> {
  const now = input.now ?? Date.now;
  const maxToolRounds = input.config?.maxToolRounds ?? ASSISTANT_CONFIG.maxToolRounds;
  const turnBudgetMs = input.config?.turnBudgetMs ?? ASSISTANT_CONFIG.turnBudgetMs;
  const started = now();
  const usage = zeroUsage();
  const messages: MessageParam[] = [...input.history, { role: "user", content: input.userContent }];
  await input.persist("user", input.userContent);
  if (input.systemNote) {
    const note: ContentBlockParam[] = [{ type: "text", text: input.systemNote }];
    await input.persist("system", note);
    messages.push({ role: "system", content: note });
  }

  let toolRounds = 0;
  let jsonRetries = 0;
  let rounds = 0;
  const done = (status: TurnStatus, error?: string): TurnResult => ({ status, error, usage, rounds });
  // Every request is charged once, whether it finished, was stopped or failed:
  // the API bills what it read and wrote either way.
  const charge = async (u: Partial<Anthropic.Beta.BetaUsage> | null) => {
    if (!u) return;
    usage.requests += 1;
    usage.input_tokens += u.input_tokens || 0;
    usage.output_tokens += u.output_tokens || 0;
    usage.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
    usage.cache_read_input_tokens += u.cache_read_input_tokens || 0;
    await input.onUsage?.(u as Anthropic.Beta.BetaUsage);
  };

  let requested = false;
  for (;;) {
    if (input.signal.aborted) return done("interrupted");
    if (requested && input.beforeRequest) {
      const stop = await input.beforeRequest();
      if (stop) return done("error", stop);
    }
    requested = true;
    const final = toolRounds >= maxToolRounds || now() - started > turnBudgetMs;
    let partialText = "";
    let message: Message;
    // Usage as the stream reports it, for a request that never completes.
    let seen: Partial<Anthropic.Beta.BetaUsage> | null = null;
    try {
      const stream = input.createStream(buildParams(messages, { final }), input.signal);
      for await (const event of stream) {
        if (event.type === "message_start") {
          seen = { ...event.message.usage };
        } else if (event.type === "message_delta" && event.usage) {
          seen = { ...(seen || {}) };
          for (const [k, v] of Object.entries(event.usage)) if (typeof v === "number") (seen as any)[k] = v;
        } else if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "text") input.emit("text_start", {});
          else if (block.type === "thinking") input.emit("progress_start", {});
          else if (block.type === "tool_use") input.emit("tool_start", { id: block.id, name: block.name });
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            partialText += event.delta.text;
            input.emit("text", { delta: event.delta.text });
          } else if (event.delta.type === "thinking_delta" && event.delta.thinking) {
            input.emit("progress", { delta: event.delta.thinking });
          }
        }
      }
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (e) {
      await Promise.resolve(charge(seen)).catch((err) => console.warn("[assistant] couldn't record usage:", err?.message || err));
      if (input.signal.aborted || e instanceof Anthropic.APIUserAbortError) {
        // Keep what was shown so the user still sees it; the turn is never replayed.
        if (partialText) await input.persist("assistant", [{ type: "text", text: partialText }]);
        return done("interrupted");
      }
      if (e instanceof Anthropic.APIError) {
        console.error("[assistant] API error:", e.status, e.message);
        if (isRetryableApiError(e)) {
          // Keep what streamed so the question can be retried instead of
          // re-asked from scratch; the turn is never replayed to the model.
          if (partialText) await input.persist("assistant", [{ type: "text", text: partialText }]);
          return done("retryable", "The answer stopped partway — the AI service hit a limit or a hiccup. You can retry this question.");
        }
        return done("error", apiErrorMessage(e));
      }
      // Tool input streamed as unparseable JSON: the block never completed, so re-issue the request.
      if (jsonRetries++ < MAX_JSON_RETRIES) {
        console.warn("[assistant] re-issuing after unparseable tool input:", (e as Error)?.message?.slice(0, 200));
        usage.retries += 1;
        input.emit("retry", {});
        continue;
      }
      console.error("[assistant] stream failed:", (e as Error)?.message || e);
      return done("error", "The assistant ran into a problem. Try again.");
    }

    rounds += 1;
    // The final message's usage is authoritative; fall back to what streamed.
    // Usage logging must never fail a delivered turn: the answer is already
    // persisted above, so a logging failure is logged and the turn completes.
    await Promise.resolve(charge(message.usage ?? seen)).catch((err) => console.warn("[assistant] couldn't record usage:", err?.message || err));

    // Verbatim, including thinking and fallback blocks: the next request replays it as is.
    await input.persist("assistant", message.content as unknown[]);
    messages.push({ role: "assistant", content: message.content as unknown as ContentBlockParam[] });

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    switch (message.stop_reason) {
      case "refusal":
        return done("refused", "The assistant declined to answer this request.");
      case "model_context_window_exceeded":
        return done("error", "This conversation has grown too long. Start a new conversation to continue.");
      case "max_tokens":
        // Cut off: a tool call that ended mid-input can still parse, so never
        // run it, and a half-written answer is shown but never replayed.
        return done("error", "The answer was cut off. Try asking for less at once.");
      case "pause_turn":
        continue;
      case "tool_use":
        break;
      default:
        return done("complete");
    }
    if (toolUses.length === 0) return done("complete");

    toolRounds += 1;
    // Stop and the hard timeout end the wait for tools too; a lookup still
    // running finishes on its own under its statement timeout, and nothing it
    // returns is used (proposals check the signal before writing).
    const aborted = new Promise<"aborted">((resolve) => {
      if (input.signal.aborted) resolve("aborted");
      else input.signal.addEventListener("abort", () => resolve("aborted"), { once: true });
    });
    const results = await Promise.race([aborted, Promise.all(toolUses.map(async (block) => {
      input.emit("tool_call", { id: block.id, name: block.name, label: toolLabel(block.name, block.input) });
      const outcome = await runTool(block.name, block.input, { ...input.toolContext, toolUseId: block.id, signal: input.signal });
      input.emit("tool_result", { id: block.id, ok: !outcome.isError });
      // Same shape as a saved card (renderTranscript), so the UI renders both alike.
      if (outcome.action) input.emit("action", { tool_use_id: block.id, action: uiAction({ ...outcome.action, result: null }) });
      const result: Anthropic.Beta.BetaToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: block.id,
        content: outcome.content,
        ...(outcome.isError ? { is_error: true } : {}),
      };
      return result;
    }))]);
    if (results === "aborted" || input.signal.aborted) return done("interrupted");
    // All results go back in one user message, in the order the calls were made.
    await input.persist("user", results);
    messages.push({ role: "user", content: results });
  }
}


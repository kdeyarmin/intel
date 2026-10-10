import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { runAssistantTurn, usageUnits, apiErrorMessage, buildParams, type RunTurnInput } from "../server/lib/assistant/loop";
import { ASSISTANT_CONFIG } from "../server/lib/assistant/config";
import { SYSTEM_PROMPT } from "../server/lib/assistant/prompt";
import type { ToolDeps } from "../server/lib/assistant/tools";
import { scriptedStreams, text, toolCall, withStop, type Step } from "./helpers/assistantHarness";

function deps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    searchProviders: vi.fn(async () => ({ providers: [{ npi: "1000000001" }], truncated: false })),
    describeProviders: vi.fn(async (npis: string[]) => new Map(npis.map((npi) => [npi, { npi, name: `Dr ${npi}`, entityType: "Individual", specialty: "Cardiology", city: "Pittsburgh", state: "PA", score: 80 }]))),
    getProviderReport: vi.fn(),
    getCountyIntelligence: vi.fn(),
    getTerritoryData: vi.fn(),
    getReferralNetwork: vi.fn(),
    getDashboardStats: vi.fn(),
    listLeadLists: vi.fn(async () => []),
    getLeadList: vi.fn(),
    existingNpis: vi.fn(async (npis: string[]) => npis),
    createProposal: vi.fn(),
    ...overrides,
  } as ToolDeps;
}

function setup(steps: Step[], extra: Partial<RunTurnInput> = {}) {
  const { factory, calls } = scriptedStreams(steps);
  const persisted: Array<{ role: string; content: any[] }> = [];
  const events: Array<[string, any]> = [];
  const controller = new AbortController();
  const toolDeps = deps();
  const input: RunTurnInput = {
    history: [],
    userContent: [{ type: "text", text: "Who are the top cardiologists in Pittsburgh?" }],
    createStream: factory,
    persist: async (role, content) => { persisted.push({ role, content: content as any[] }); },
    emit: (e, d) => events.push([e, d]),
    toolContext: { userId: 7, conversationId: 3, turnId: 11, deps: toolDeps },
    signal: controller.signal,
    ...extra,
  };
  return { input, calls, persisted, events, controller, toolDeps };
}

describe("runAssistantTurn", () => {
  it("streams a plain answer and stores the question and the reply verbatim", async () => {
    const { input, calls, persisted, events } = setup([text("Here are three cardiologists.")]);
    const result = await runAssistantTurn(input);
    expect(result.status).toBe("complete");
    expect(result.usage).toMatchObject({ input_tokens: 100, output_tokens: 20, requests: 1 });
    expect(persisted.map((p) => p.role)).toEqual(["user", "assistant"]);
    expect(persisted[1].content).toEqual([{ type: "text", text: "Here are three cardiologists.", citations: null }]);
    expect(events.filter(([e]) => e === "text").map(([, d]) => d.delta).join("")).toBe("Here are three cardiologists.");
    expect(calls).toHaveLength(1);
  });

  it("sends the configured request: grounded system prompt, tools, adaptive thinking with progress notes, effort, caching and fallback", () => {
    const p = buildParams([{ role: "user", content: "hi" }], { final: false }) as any;
    expect(p.model).toBe(ASSISTANT_CONFIG.model);
    expect(p.system).toBe(SYSTEM_PROMPT);
    expect(p.thinking).toEqual({ type: "adaptive", display: "updates", block_binding: { prefix_mismatch_behavior: "drop_block" } });
    expect(p.output_config).toEqual({ effort: ASSISTANT_CONFIG.effort });
    expect(p.cache_control).toEqual({ type: "ephemeral" });
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toEqual(expect.arrayContaining(["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18", "thinking-binding-controls-2026-08-01"]));
    expect(p.tool_choice).toBeUndefined();
    expect(p).not.toHaveProperty("temperature");
    expect(p).not.toHaveProperty("budget_tokens");
    expect(buildParams([], { final: true }).tool_choice).toEqual({ type: "none" });
  });

  it("runs requested tools, returns all results in one message and replays the turn append-only", async () => {
    const { input, calls, persisted, events, toolDeps } = setup([
      toolCall([{ id: "toolu_1", name: "search_providers", input: { query: "Chen", state: "PA" } }, { id: "toolu_2", name: "list_lead_lists", input: {} }], { note: "Looking up Dr Chen" }),
      text("Dr Chen is a cardiologist."),
    ]);
    const result = await runAssistantTurn(input);
    expect(result.status).toBe("complete");
    expect(toolDeps.searchProviders).toHaveBeenCalledWith(expect.objectContaining({ q: "Chen", state: "PA", limit: 10 }));
    expect(persisted.map((p) => p.role)).toEqual(["user", "assistant", "user", "assistant"]);
    const results = persisted[2].content;
    expect(results.map((r: any) => r.tool_use_id)).toEqual(["toolu_1", "toolu_2"]);
    expect(JSON.parse(results[0].content).providers[0]).toMatchObject({ npi: "1000000001", name: "Dr 1000000001", score: 80 });
    // Second request = first request's messages + the assistant turn (with its thinking block) + the results.
    expect(calls[1].messages.slice(0, 1)).toEqual(calls[0].messages);
    expect(calls[1].messages[1]).toEqual({ role: "assistant", content: persisted[1].content });
    expect((calls[1].messages[1].content as any[])[0]).toMatchObject({ type: "thinking", signature: "sig" });
    expect(calls[1].system).toBe(calls[0].system);
    expect(calls[1].tools).toEqual(calls[0].tools);
    expect(events.map(([e]) => e)).toEqual(expect.arrayContaining(["progress_start", "progress", "tool_start", "tool_call", "tool_result"]));
    expect(events.find(([e]) => e === "tool_call")![1]).toMatchObject({ id: "toolu_1", label: "Searched providers for “Chen” in PA" });
  });

  it("hands bad tool input back to the model as an error result instead of running the tool", async () => {
    const { input, persisted, toolDeps } = setup([
      toolCall([{ id: "toolu_1", name: "get_provider_profile", input: { npi: "12" } }]),
      text("Sorry, that NPI looks wrong."),
    ]);
    await runAssistantTurn(input);
    expect(toolDeps.getProviderReport).not.toHaveBeenCalled();
    expect(persisted[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1", is_error: true });
    expect(persisted[2].content[0].content).toContain("INVALID_INPUT");
  });

  it("stops offering tools once the round limit is reached", async () => {
    const loop = (i: number) => toolCall([{ id: `toolu_${i}`, name: "list_lead_lists", input: {} }]);
    const { input, calls } = setup([loop(1), loop(2), text("Done.")], { config: { maxToolRounds: 2 } });
    const result = await runAssistantTurn(input);
    expect(result.status).toBe("complete");
    expect(calls.map((c) => c.tool_choice)).toEqual([undefined, undefined, { type: "none" }]);
  });

  it("stops offering tools once the time budget is spent", async () => {
    let t = 0;
    const { input, calls } = setup([toolCall([{ id: "toolu_1", name: "list_lead_lists", input: {} }]), text("Done.")], {
      now: () => (t += 60_000),
      config: { turnBudgetMs: 90_000 },
    });
    await runAssistantTurn(input);
    expect(calls[1].tool_choice).toEqual({ type: "none" });
  });

  it("reports a refusal and doesn't run that turn's tools", async () => {
    const { input, toolDeps } = setup([withStop(toolCall([{ id: "toolu_1", name: "list_lead_lists", input: {} }]), "refusal")]);
    const result = await runAssistantTurn(input);
    expect(result.status).toBe("refused");
    expect(toolDeps.listLeadLists).not.toHaveBeenCalled();
  });

  it("never runs a tool call cut off by max_tokens", async () => {
    const { input, toolDeps } = setup([withStop(toolCall([{ id: "toolu_1", name: "list_lead_lists", input: {} }]), "max_tokens")]);
    const result = await runAssistantTurn(input);
    expect(result.status).toBe("error");
    expect(toolDeps.listLeadLists).not.toHaveBeenCalled();
  });

  it("marks the turn interrupted when the user stops it, keeping the text shown so far", async () => {
    const { input, persisted, controller } = setup([{ hang: true, partial: "Looking at Allegheny" }]);
    const running = runAssistantTurn(input);
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    const result = await running;
    expect(result.status).toBe("interrupted");
    expect(persisted.at(-1)).toEqual({ role: "assistant", content: [{ type: "text", text: "Looking at Allegheny" }] });
  });

  it("re-issues the request when streamed tool input can't be parsed, then gives up", async () => {
    const bad = { throw: new Error("Unable to parse tool parameter JSON from model.") };
    const ok = setup([bad, text("Recovered.")]);
    expect((await runAssistantTurn(ok.input)).status).toBe("complete");
    expect(ok.events.some(([e]) => e === "retry")).toBe(true);
    const failing = setup([bad, bad, bad]);
    expect((await runAssistantTurn(failing.input)).status).toBe("error");
  });

  it("turns API errors into a sentence the user can act on, without retrying", async () => {
    const err = new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "slow down", new Headers());
    const { input, calls } = setup([{ throw: err }]);
    const result = await runAssistantTurn(input);
    expect(result).toMatchObject({ status: "error", error: expect.stringMatching(/rate-limiting/) });
    expect(calls).toHaveLength(1);
    expect(apiErrorMessage(new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers()))).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("puts app news in a system message after the question", async () => {
    const { input, calls, persisted } = setup([text("Noted.")], { systemNote: "App update since your last answer: the user cancelled the proposed lead list." });
    await runAssistantTurn(input);
    expect(persisted.map((p) => p.role)).toEqual(["user", "system", "assistant"]);
    expect(calls[0].messages.map((m) => m.role)).toEqual(["user", "system"]);
  });

  it("charges cache reads at a tenth", () => {
    expect(usageUnits({ input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 } as any)).toBe(215);
    expect(usageUnits(null)).toBe(0);
  });
});

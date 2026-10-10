import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLAUDE_MODELS } from "../server/lib/aiModels";

describe("assistant model", () => {
  it("has its own overridable model", () => {
    expect(CLAUDE_MODELS.ASSISTANT).toMatch(/^claude-/);
    expect(readFileSync("server/lib/aiModels.ts", "utf8")).toMatch(/ASSISTANT: process\.env\.CLAUDE_MODEL_ASSISTANT \|\| "claude-[a-z0-9-]+"/);
  });

  it("is not reachable through the generic /ai/invoke endpoint", () => {
    const src = readFileSync("server/routes/integrations.ts", "utf8");
    const allow = src.match(/const ALLOWED_MODELS = new Set<string>\(\[([^\]]*)\]\)/);
    expect(allow?.[1]).toBeDefined();
    expect(allow![1]).not.toContain("ASSISTANT");
    expect(src).not.toMatch(/Object\.values\(CLAUDE_MODELS\)/);
  });

  it("is never hardcoded outside aiModels.ts", () => {
    for (const file of ["server/lib/assistant/config.ts", "server/lib/assistant/loop.ts", "server/routes/assistant.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/claude-(opus|sonnet|haiku|fable)-\d/);
    }
  });
});

/**
 * A function that is authorized (or called by a page) but never dispatched
 * answers 404 to everyone, admins included: the ACL, the pages and the
 * dispatcher in server/routes/functions.ts have to name the same functions.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { PUBLIC_FUNCTIONS } from "../server/lib/functionAcl";

const root = path.join(import.meta.dirname, "..");
const dispatcher = fs.readFileSync(path.join(root, "server", "routes", "functions.ts"), "utf8");
const cases = new Set([...dispatcher.matchAll(/case "([A-Za-z0-9_]+)"/g)].map((m) => m[1]));

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(jsx?|tsx?)$/.test(e.name) ? [full] : [];
  });
}

describe("function dispatcher", () => {
  it("dispatches every public function", () => {
    expect([...PUBLIC_FUNCTIONS].filter((name) => !cases.has(name))).toEqual([]);
  });

  it("dispatches every function the pages invoke by name", () => {
    const invoked = new Map<string, string>();
    for (const file of sourceFiles(path.join(root, "src"))) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(/functions\.invoke\(\s*['"]([A-Za-z0-9_]+)['"]/g)) invoked.set(m[1], path.relative(root, file));
    }
    expect(invoked.size).toBeGreaterThan(20);
    const undispatched = [...invoked].filter(([name]) => !cases.has(name)).map(([name, file]) => `${name} (${file})`);
    expect(undispatched).toEqual([]);
  });

  it("dispatches the lead scoring functions the Scoring Rules page calls", () => {
    expect(cases.has("getLeadScoringStatus")).toBe(true);
    expect(cases.has("recalculateLeadScores")).toBe(true);
  });
});

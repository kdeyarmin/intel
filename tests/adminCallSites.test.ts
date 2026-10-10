/**
 * Admin-only backend functions (anything not in PUBLIC_FUNCTIONS) answer 403
 * for regular users. A component that calls one must only be reachable from
 * admin-only pages, or must check `isAdmin` itself — otherwise regular users
 * get buttons that can only fail.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { PUBLIC_FUNCTIONS } from "../server/lib/functionAcl";
// @ts-expect-error -- plain JS module
import { canAccessPage } from "../src/components/layout/navConfig";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const EXTS = [".jsx", ".js", ".tsx", ".ts"];

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(p);
    return EXTS.includes(path.extname(e.name)) ? [p] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, "index" + e))]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const files = listFiles(SRC);
const source = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

// importer graph: file -> files that import it
const importedBy = new Map<string, Set<string>>();
for (const [file, text] of source) {
  for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const target = resolveImport(file, m[1]);
    if (!target) continue;
    if (!importedBy.has(target)) importedBy.set(target, new Set());
    importedBy.get(target)!.add(file);
  }
}

const PAGES_DIR = path.join(SRC, "pages");
const pageName = (file: string) => (path.dirname(file) === PAGES_DIR ? path.basename(file, path.extname(file)) : null);
const guarded = (file: string) => /\bisAdmin\b/.test(source.get(file) || "");

/** Pages a regular user can open that (transitively) render this file without an isAdmin guard on the way. */
function userReachablePages(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  if (guarded(file)) return [];
  const page = pageName(file);
  if (page) return canAccessPage(page, "user") ? [page] : [];
  // Shared shell pieces render on every page.
  if (/src\/(App\.jsx|Layout\.jsx|components\/layout\/)/.test(file)) return ["(layout)"];
  return [...(importedBy.get(file) || [])].flatMap((parent) => userReachablePages(parent, seen));
}

describe("admin-only function call sites", () => {
  const callSites: Array<{ file: string; fn: string }> = [];
  for (const [file, text] of source) {
    for (const m of text.matchAll(/(?:functions\.invoke|invokeOrThrow)\(\s*['"](\w+)['"]/g)) {
      if (!PUBLIC_FUNCTIONS.has(m[1])) callSites.push({ file, fn: m[1] });
    }
  }

  it("finds the call sites", () => {
    expect(callSites.length).toBeGreaterThan(10);
  });

  it("are only reachable by admins", () => {
    const leaks = callSites
      .map(({ file, fn }) => ({ file: path.relative(ROOT, file), fn, pages: userReachablePages(file) }))
      .filter((l) => l.pages.length > 0)
      .map((l) => `${l.file} calls ${l.fn}, reachable by regular users via ${[...new Set(l.pages)].join(", ")}`);
    expect(leaks).toEqual([]);
  });
});

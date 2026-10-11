/**
 * Admin-only backend functions (anything not in PUBLIC_FUNCTIONS) answer 403
 * for regular users. A component that calls one must only be reachable from
 * admin-only pages, or the call site must be guarded and say so: a comment
 * `// admin-only: <how it's guarded>` on the call or the three lines above it
 * (in a file that does check isAdmin / role). Otherwise regular users get
 * buttons that can only fail. A call whose function name isn't a literal
 * counts as admin-only unless its file is listed in DYNAMIC_CALLERS.
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
const CHECKS_ROLE = /\bisAdmin\b|role\s*===\s*['"]admin['"]/;

/** The call at `index` carries an `admin-only:` note, in a file that really checks the role. */
function annotated(file: string, index: number): boolean {
  const text = source.get(file) || "";
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index);
  const before = text.slice(0, lineStart).split("\n").slice(-4).join("\n");
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  return /\/\/\s*admin-only:\s*\S/.test(`${before}\n${line}`) && CHECKS_ROLE.test(text);
}

/**
 * A call whose function name isn't a string literal (`invoke(key)`) can't be
 * checked by name, so it counts as a call to an admin-only function. A file
 * that picks from a fixed set of functions can be listed here with that set
 * instead; each name is then checked like a literal call.
 */
const DYNAMIC_CALLERS: Record<string, string[]> = {
  // invokeOrThrow passes its argument through; its callers are scanned by name.
  "src/api/functionResult.js": [],
};
const DYNAMIC = "<dynamic name>";

/** Admin-only functions this file calls (without an admin-only note). */
function adminCalls(file: string): string[] {
  const text = source.get(file) || "";
  const found: string[] = [];
  const listed = DYNAMIC_CALLERS[path.relative(ROOT, file)];
  const add = (fn: string, index: number) => {
    if (!PUBLIC_FUNCTIONS.has(fn) && !annotated(file, index)) found.push(fn);
  };
  for (const m of text.matchAll(/\b(functions\.invoke|invokeOrThrow)\b(\s*\(\s*(?:['"](\w+)['"]\s*[,)])?)?/g)) {
    const [, callee, call, name] = m;
    if (name) add(name, m.index!);
    else if (!call && callee === "invokeOrThrow") continue; // an import, not a call
    else if (/\bfunction\s+$/.test(text.slice(Math.max(0, m.index! - 20), m.index))) continue; // the definition
    else if (listed) listed.forEach((fn) => add(fn, m.index!));
    else add(DYNAMIC, m.index!);
  }
  return found;
}

/** Pages a regular user can open that (transitively) render this file. */
function userReachablePages(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const page = pageName(file);
  if (page) return canAccessPage(page, "user") ? [page] : [];
  // Shared shell pieces render on every page.
  if (/src\/(App\.jsx|Layout\.jsx|components\/layout\/)/.test(file)) return ["(layout)"];
  return [...(importedBy.get(file) || [])].flatMap((parent) => userReachablePages(parent, seen));
}

describe("admin-only function call sites", () => {
  const callSites = [...source.keys()].flatMap((file) => adminCalls(file).map((fn) => ({ file, fn })));

  it("finds the call sites", () => {
    expect(callSites.length).toBeGreaterThan(10);
    const dynamic = callSites.filter((c) => c.fn === DYNAMIC).map((c) => path.relative(ROOT, c.file));
    expect(dynamic).toEqual(expect.arrayContaining([
      "src/components/imports/ImportScheduleManager.jsx",
      "src/components/imports/MaintenanceHealthPanel.jsx",
    ]));
  });

  it("only accepts an admin-only note on the call itself, in a file that checks the role", () => {
    source.set("/virtual/a.jsx", "const isAdmin = user?.role === 'admin';\n// admin-only: button renders only for admins\nbase44.functions.invoke('x');\nbase44.functions.invoke('y');");
    source.set("/virtual/b.jsx", "// admin-only: trust me\nbase44.functions.invoke('x');");
    try {
      const a = source.get("/virtual/a.jsx")!;
      expect(annotated("/virtual/a.jsx", a.indexOf("invoke('x')"))).toBe(true);
      expect(annotated("/virtual/a.jsx", a.indexOf("invoke('y')"))).toBe(true); // within three lines
      const far = "const isAdmin = true;\n// admin-only: x\n\n\n\n\nbase44.functions.invoke('z');";
      source.set("/virtual/c.jsx", far);
      expect(annotated("/virtual/c.jsx", far.indexOf("invoke('z')"))).toBe(false);
      const b = source.get("/virtual/b.jsx")!;
      expect(annotated("/virtual/b.jsx", b.indexOf("invoke('x')"))).toBe(false);
    } finally {
      for (const f of ["/virtual/a.jsx", "/virtual/b.jsx", "/virtual/c.jsx"]) source.delete(f);
    }
  });

  it("counts a call with a non-literal function name as admin-only", () => {
    const file = path.join(SRC, "components/virtual/Dynamic.jsx");
    const rel = path.relative(ROOT, file);
    source.set(file, [
      "const run = (key) => base44.functions.invoke(key);",
      "const go = () => invokeOrThrow(`${name}`);",
      "const alias = base44.functions.invoke;",
      "base44.functions.invoke('a' + suffix);",
      "base44.functions.invoke(",
      "  'searchProviders', {});",
    ].join("\n"));
    try {
      expect(PUBLIC_FUNCTIONS.has("searchProviders")).toBe(true);
      expect(PUBLIC_FUNCTIONS.has("cleanupAllImports")).toBe(false);
      expect(adminCalls(file)).toEqual([DYNAMIC, DYNAMIC, DYNAMIC, DYNAMIC]);
      // A listed file's dynamic calls are checked against the names it lists.
      DYNAMIC_CALLERS[rel] = ["searchProviders", "cleanupAllImports"];
      expect(adminCalls(file)).toEqual(Array(4).fill("cleanupAllImports"));
      DYNAMIC_CALLERS[rel] = ["searchProviders"];
      expect(adminCalls(file)).toEqual([]);
    } finally {
      source.delete(file);
      delete DYNAMIC_CALLERS[rel];
    }
  });

  it("are only reachable by admins", () => {
    const leaks = callSites
      .map(({ file, fn }) => ({ file: path.relative(ROOT, file), fn, pages: userReachablePages(file) }))
      .filter((l) => l.pages.length > 0)
      .map((l) => `${l.file} calls ${l.fn}, reachable by regular users via ${[...new Set(l.pages)].join(", ")}`);
    expect(leaks).toEqual([]);
  });
});

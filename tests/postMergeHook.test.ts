/**
 * The Replit post-merge hook must fail when migrations fail, so a deploy
 * doesn't start the app against an outdated schema.
 */
import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const SCRIPT = path.resolve(import.meta.dirname, "..", "scripts", "post-merge.sh");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-merge-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Run the hook with a stub `npm` that records its calls and exits with `migrateExit` for db:migrate. */
function runHook(migrateExit: number) {
  const log = path.join(dir, `calls-${migrateExit}.log`);
  fs.writeFileSync(
    path.join(dir, "npm"),
    `#!/bin/bash\necho "$*" >> "${log}"\nif [ "$1 $2" = "run db:migrate" ]; then exit ${migrateExit}; fi\nexit 0\n`,
    { mode: 0o755 },
  );
  const result = spawnSync("bash", [SCRIPT], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, encoding: "utf8" });
  return { status: result.status, calls: fs.readFileSync(log, "utf8").trim().split("\n") };
}

describe("scripts/post-merge.sh", () => {
  it("runs db:migrate and succeeds when it does", () => {
    const { status, calls } = runHook(0);
    expect(calls.at(-1)).toBe("run db:migrate");
    expect(status).toBe(0);
  });

  it("fails when db:migrate fails", () => {
    expect(runHook(3).status).not.toBe(0);
  });
});

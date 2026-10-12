/**
 * Uploaded files are served from the app's own origin, so none may render as a page there: an uploaded .xml with an
 * XHTML root would run its scripts as the signed-in viewer. Real express.static over a real folder, checked by headers.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { uploadHeaders, uploadsStatic } from "../server/lib/uploadsStatic";

const XHTML_WITH_SCRIPT = '<html xmlns="http://www.w3.org/1999/xhtml"><script>alert(document.domain)</script></html>';

let dir: string;
let server: Server;
let base: string;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-"));
  for (const [name, body] of Object.entries({
    "page.xml": XHTML_WITH_SCRIPT, "data.csv": "a,b\n1,2\n", "notes.txt": "hello", "doc.pdf": "%PDF-1.4", "list.json": "{}", "pic.png": "\x89PNG", "pic.JPG": "jpg",
  })) fs.writeFileSync(path.join(dir, name), body);
  const app = express();
  app.use("/api/storage", uploadsStatic(dir));
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = (name: string) => fetch(`${base}/api/storage/${name}`);

describe("served uploads", () => {
  it("makes an uploaded XML document inert: a download, sandboxed, with no scripts and no sniffing", async () => {
    const r = await get("page.xml");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toBe("attachment");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    const csp = r.headers.get("content-security-policy")!;
    expect(csp).toMatch(/default-src 'none'/);
    expect(csp).toMatch(/\bsandbox\b/);
    expect(csp).not.toMatch(/script-src/);
  });

  it("downloads every data and document type", async () => {
    for (const name of ["data.csv", "notes.txt", "doc.pdf", "list.json"]) {
      const r = await get(name);
      expect(r.headers.get("content-disposition"), name).toBe("attachment");
      expect(r.headers.get("x-content-type-options"), name).toBe("nosniff");
    }
  });

  it("lets images display, still sandboxed and unsniffed", async () => {
    for (const name of ["pic.png", "pic.JPG"]) {
      const r = await get(name);
      expect(r.status, name).toBe(200);
      expect(r.headers.get("content-disposition"), name).toBeNull();
      expect(r.headers.get("x-content-type-options"), name).toBe("nosniff");
      expect(r.headers.get("content-security-policy"), name).toMatch(/sandbox/);
    }
  });

  it("still serves the file's own bytes", async () => {
    expect(await (await get("data.csv")).text()).toBe("a,b\n1,2\n");
  });
});

describe("uploadHeaders", () => {
  it("treats an extension case-insensitively and an unknown or missing one as a download", () => {
    const seen: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { seen[k] = v; } };
    uploadHeaders(res, "/x/PIC.PNG");
    expect(seen["Content-Disposition"]).toBeUndefined();
    for (const f of ["/x/file", "/x/page.xhtml", "/x/page.svg", "/x/page.html"]) {
      const out: Record<string, string> = {};
      uploadHeaders({ setHeader: (k: string, v: string) => { out[k] = v; } }, f);
      expect(out["Content-Disposition"], f).toBe("attachment");
    }
  });
});

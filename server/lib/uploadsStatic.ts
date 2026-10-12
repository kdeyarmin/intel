// Serving uploaded files back to signed-in users. They are served from the app's own origin, so a browser that
// opens one as a page would run it with the viewer's session: an uploaded .xml whose root is an XHTML document
// carries <script> that a browser executes, and any signed-in member could send an administrator the link to it.
// Every upload is therefore served as inert data:
//  - nosniff, so the declared type is the type;
//  - a content security policy with `sandbox` and no sources, so a document that is rendered anyway has an opaque
//    origin, no scripts and no outside loads (the same policy GitHub puts on user content);
//  - a download rather than a page, for everything except the image types the upload filter allows.
import path from "path";
import express from "express";

/** The image types that may display in the browser. Everything else downloads. */
const INLINE_TYPES = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** The headers an uploaded file is served with (express.static's `setHeaders`). */
export function uploadHeaders(res: { setHeader(name: string, value: string): unknown }, filePath: string): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  if (!INLINE_TYPES.has(path.extname(filePath).toLowerCase())) res.setHeader("Content-Disposition", "attachment");
}

/** Static file serving for the uploads folder, with the headers above. */
export function uploadsStatic(dir: string) {
  return express.static(dir, { setHeaders: (res, filePath) => uploadHeaders(res, filePath) });
}

/**
 * The message a failed request may show. Database and connection errors can
 * carry SQL, schema or host details, so in production they're replaced with a
 * generic message; the server log keeps the original. Errors a handler threw
 * on purpose (with a status) or with its own wording pass through.
 */
export function publicErrorMessage(e: any, production = process.env.NODE_ENV === "production"): string {
  const message = e?.message || "Request failed.";
  if (!production || e?.status) return message;
  return isInternalError(e) ? "Unable to complete the request. Please try again." : message;
}

/** A PostgreSQL error (SQLSTATE code, severity) or a system/network error (ECONNREFUSED, ETIMEDOUT…). */
function isInternalError(e: any): boolean {
  const code = typeof e?.code === "string" ? e.code : "";
  return Boolean(e?.severity || e?.routine || /^[0-9A-Z]{5}$/.test(code) || /^E[A-Z]+$/.test(code));
}

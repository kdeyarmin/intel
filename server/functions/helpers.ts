export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const isRateLimit = /429|rate limit|too many requests/i.test(e.message);
      const isNetwork =
        /network|connection|reset|timeout|ECONNREFUSED|ENOTFOUND/i.test(
          e.message
        );
      const isServerError =
        /500|502|503|504|internal server error|bad gateway|service unavailable|gateway timeout/i.test(
          e.message
        );
      if ((isRateLimit || isNetwork || isServerError) && attempt < maxRetries) {
        const backoff = Math.min(
          Math.pow(2, attempt) * 500 + Math.random() * 1000,
          5000
        );
        await sleep(backoff);
        continue;
      }
      throw e;
    }
  }
  throw new Error("withRetry exhausted");
}

const SYSTEM_FIELDS = new Set([
  "id",
  "created_date",
  "updated_date",
  "_id",
  "__v",
]);
export function stripSystemFields(obj: Record<string, any>) {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!SYSTEM_FIELDS.has(k)) clean[k] = v;
  }
  return clean;
}

export function isIdentical(
  a: Record<string, any>,
  b: Record<string, any>,
  fields: string[]
) {
  for (const f of fields) {
    if ((a[f] ?? "").toString().trim() !== (b[f] ?? "").toString().trim())
      return false;
  }
  return true;
}

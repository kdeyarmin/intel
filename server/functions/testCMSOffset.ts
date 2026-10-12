// Port of base44/functions/testCMSOffset/entry.ts
// Dev diagnostic: fetch a URL and return the first 500 chars of the response body.
//
// Original was a Deno.serve handler; ported to a plain async handler for the
// Express route wrapper. Errors propagate to the route-level error handler
// (the original returned HTTP 500 via Response.json({ error }, { status: 500 })).
export async function handleTestCmsOffset(payload: any, user?: any): Promise<any> {
  const resp = await fetch(payload.url);
  const text = await resp.text();
  return { text: text.substring(0, 500) };
}

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const resp = await fetch(payload.url);
    const text = await resp.text();
    return Response.json({ text: text.substring(0, 500) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
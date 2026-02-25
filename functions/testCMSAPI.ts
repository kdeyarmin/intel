import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const resp = await fetch('https://data.cms.gov/api/site-data/search?keywords=Medicare%20Part%20D%20Statistics');
    if (!resp.ok) {
        return Response.json({ error: `Failed: ${resp.status}`, text: await resp.text() });
    }
    const data = await resp.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
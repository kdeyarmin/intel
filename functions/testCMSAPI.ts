import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const url = 'https://data.cms.gov/data-api/v1/dataset/search?title=Medicare%20Part%20D';
    const resp = await fetch(url);
    const json = await resp.json().catch(() => ({ error: 'not json', text: resp.statusText }));
    
    return Response.json({ status: resp.status, data: json });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
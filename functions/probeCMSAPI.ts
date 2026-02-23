import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const url = 'https://data.cms.gov/data-api/v1/dataset?keyword=Medicare%20Home%20Health%20Agency';
        const resp = await fetch(url);
        if (!resp.ok) return Response.json({ error: `Fetch failed: ${resp.status}` });
        const data = await resp.json();
        return Response.json(data);
    } catch (e) {
        return Response.json({ error: e.message });
    }
});
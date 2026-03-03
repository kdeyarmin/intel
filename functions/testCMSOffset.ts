import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const payload = await req.json();
        
        const url1 = "https://data.cms.gov/provider-data/api/1/datastore/query/ct36-nrcq/0?$offset=100&$limit=10";
        const url2 = "https://data.cms.gov/provider-data/api/1/datastore/query/ct36-nrcq/0?offset=100&limit=10";
        
        const r1 = await fetch(url1);
        const j1 = await r1.json();
        
        const r2 = await fetch(url2);
        const j2 = await r2.json();
        
        return Response.json({
            url1_results: j1.results?.length,
            url1_first: j1.results?.[0],
            url2_results: j2.results?.length,
            url2_first: j2.results?.[0]
        });
    } catch (e) {
        return Response.json({ error: e.message }, {status: 500});
    }
});
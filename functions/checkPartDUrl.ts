import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const url = 'https://data.cms.gov/sites/default/files/2025-09/CPS%20MDCR%20UTLZN%20D%202023.zip';
    try {
        const resp = await fetch(url, { method: 'HEAD' });
        return Response.json({ 
            url, 
            status: resp.status, 
            ok: resp.ok,
            type: resp.headers.get('content-type'),
            len: resp.headers.get('content-length')
        });
    } catch (e) {
        return Response.json({ error: e.message });
    }
});
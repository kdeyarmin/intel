import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const p1 = await base44.asServiceRole.entities.Provider.filter({}, undefined, 1);
    const p100 = await base44.asServiceRole.entities.Provider.filter({}, undefined, 100);
    return Response.json({
        p1Length: p1.length,
        p100Length: p100.length,
        p1Keys: Object.keys(p1),
        p1Count: p1.count || p1.total_count || null
    });
});
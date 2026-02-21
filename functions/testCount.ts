import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // Try to find a count method or see if list returns an object with count
        let count = -1;
        try {
             // Some ORMs have .count()
             count = await base44.entities.Provider.count();
        } catch (e) {
            count = -2; // method not found
        }
        
        return Response.json({ count });
    } catch (error) {
        return Response.json({ error: error.message });
    }
});
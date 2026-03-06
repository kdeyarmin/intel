import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const withEmail1 = await base44.asServiceRole.entities.Provider.filter({ email: { $ne: null } }, undefined, 10);
    const withEmail2 = await base44.asServiceRole.entities.Provider.filter({ email_validation_status: 'valid' }, undefined, 10);
    return Response.json({
        hasNe: withEmail1.length,
        hasValid: withEmail2.length,
        items: withEmail1.map(p => p.email)
    });
});
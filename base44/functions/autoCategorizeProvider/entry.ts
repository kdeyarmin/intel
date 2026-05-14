import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        return Response.json({ success: false, message: 'AI integrations paused to save credits' });
        const base44 = createClientFromRequest(req);
        
        let payload;
        try {
            payload = await req.json();
        } catch(e) {
            return Response.json({ error: 'Invalid payload' }, { status: 400 });
        }
        
        const { event, data } = payload;
        
        if (!data || event?.entity_name !== 'Provider') {
            return Response.json({ success: false, message: 'Invalid event' });
        }

        const provider = data;
        
        // If already categorized, skip
        if (provider.ai_category && provider.ai_category.trim() !== '') {
            return Response.json({ success: true, message: 'Already categorized' });
        }

        const prompt = `Categorize this healthcare provider into a single short taxonomy or specialty string based on their data. Keep it concise (e.g. "Cardiologist", "General Hospital", "Nurse Practitioner"). Only return the category string, no quotes or extra text.
        
        Data: ${JSON.stringify({ 
            credential: provider.credential, 
            first_name: provider.first_name, 
            last_name: provider.last_name, 
            organization_name: provider.organization_name,
            entity_type: provider.entity_type
        })}`;

        const categoryResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt });
        
        if (categoryResponse) {
            await base44.asServiceRole.entities.Provider.update(provider.id, {
                ai_category: categoryResponse.trim().replace(/^"|"$/g, '')
            });
        }

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
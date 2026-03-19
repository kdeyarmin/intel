import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();
        const { event, data, old_data, payload_too_large } = payload;
        
        if (!event || event.entity_name !== 'ImportBatch') {
            return Response.json({ message: 'Ignored event' });
        }

        let currentData = data;
        if (payload_too_large) {
            currentData = await base44.asServiceRole.entities.ImportBatch.get(event.entity_id);
        }

        if (!currentData) {
             return Response.json({ message: 'No data available' });
        }

        const statusChangedToFailed = currentData.status === 'failed' && (!old_data || old_data.status !== 'failed');
        const isNewFailure = event.type === 'create' && currentData.status === 'failed';

        if (statusChangedToFailed || isNewFailure) {
            console.log(`[onImportBatchFailed] Batch ${event.entity_id} failed: type=${currentData.import_type}, reason=${currentData.cancel_reason || 'unknown'}`);

            try {
                await base44.asServiceRole.entities.AuditEvent.create({
                    event_type: 'import_failed',
                    entity_type: 'ImportBatch',
                    entity_id: event.entity_id,
                    details: `Import failed: ${currentData.import_type} — ${currentData.cancel_reason || 'Unknown error'}`,
                    performed_by: 'system',
                });
            } catch (auditErr) {
                console.error('[onImportBatchFailed] Failed to create audit event:', auditErr.message);
            }

            return Response.json({ success: true, logged: true });
        }
        
        return Response.json({ success: true, message: 'Not a new failure' });
    } catch (error) {
        console.error('Error in onImportBatchFailed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();
        const { event, data, old_data, payload_too_large } = payload;
        
        if (!event || event.entity_name !== 'ImportBatch') {
            return Response.json({ message: 'Ignored event' });
        }

        let currentData = data;
        let previousData = old_data;

        // If payload is too large, we must fetch the data directly
        if (payload_too_large) {
            currentData = await base44.asServiceRole.entities.ImportBatch.get(event.entity_id);
            // We cannot easily know previousData status if payload was too large and it's an update,
            // but we can assume if it's currently failed, we'll process it. 
            // To prevent duplicate emails, we could check a custom field like 'notified_failed',
            // but for now, we'll proceed if it's failed.
        }

        if (!currentData) {
             return Response.json({ message: 'No data available' });
        }

        // Check if status changed to failed
        const statusChangedToFailed = currentData.status === 'failed' && (!previousData || previousData.status !== 'failed');
        
        // Also trigger if it was created with 'failed' status
        const isNewFailure = event.type === 'create' && currentData.status === 'failed';

        // Additional safeguard for payload_too_large where previousData is null
        const isJustFailed = currentData.status === 'failed';
        
        // Check for performance bottleneck / stalled
        const statusChangedToPaused = currentData.status === 'paused' && (!previousData || previousData.status !== 'paused');
        const isBottleneck = statusChangedToPaused && (currentData.cancel_reason?.toLowerCase().includes('stall') || currentData.cancel_reason?.toLowerCase().includes('timeout'));

        if (statusChangedToFailed || isNewFailure || (payload_too_large && isJustFailed) || isBottleneck) {
            // Get admin users to notify
            const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
            const adminEmails = admins.map(u => u.email).filter(Boolean);
            
            if (adminEmails.length > 0) {
                const appUrl = 'https://' + req.headers.get('host');
                const logsLink = `${appUrl}/import-monitoring?batch_id=${currentData.id}&tab=logs`;
                
                const eventType = isBottleneck ? 'Performance Bottleneck (Stalled)' : 'Critical Import Failure';
                const subject = `[Alert] ${eventType}: ${currentData.import_type}`;
                const body = `An import batch has ${isBottleneck ? 'hit a performance bottleneck and stalled' : 'failed'} in the system.\n\n` +
                             `Type: ${currentData.import_type}\n` +
                             `File: ${currentData.file_name || 'N/A'}\n` +
                             `Reason: ${currentData.cancel_reason || currentData.error_samples?.[0]?.detail || 'Unknown error'}\n\n` +
                             `Direct link to logs: ${logsLink}\n\n` +
                             `You can also set up a Slack email integration to forward these alerts to a Slack channel.`;
                
                for (const to of adminEmails) {
                    await base44.asServiceRole.integrations.Core.SendEmail({
                        to,
                        subject,
                        body
                    });
                }
            }
            return Response.json({ success: true, notified: adminEmails.length });
        }
        
        return Response.json({ success: true, message: 'Not a new failure' });
    } catch (error) {
        console.error('Error in onImportBatchFailed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
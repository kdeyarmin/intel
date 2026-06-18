import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();
        const { event } = payload;
        
        if (!event) return Response.json({ message: 'No event data' });

        // Cap how many times a single failed batch can be auto-retried by
        // rule-creation events. Without this, creating N rules re-triggers the
        // same failed batches N times (burning import + LLM credits) because
        // nothing tracked prior attempts.
        const MAX_RULE_RETRY_ATTEMPTS = 3;

        // Find recent failed imports (limit to 10 most recent)
        const failedBatches = await base44.asServiceRole.entities.ImportBatch.filter({
             status: 'failed',
        }, '-created_date', 10);

        const retried = [];
        for (const batch of failedBatches) {
            try {
                const errorSamples = batch.error_samples || [];

                // Check if failure involved 'missing_category' error
                const hasMissingCategory = errorSamples.some(e => e.rule === 'missing_category' || e.detail?.includes('missing_category'));
                if (!hasMissingCategory) continue;

                const params = batch.retry_params || {};
                const ruleRetryCount = typeof params.rule_retry_count === 'number' && params.rule_retry_count >= 0
                    ? params.rule_retry_count
                    : 0;
                if (ruleRetryCount >= MAX_RULE_RETRY_ATTEMPTS) continue;

                // Stamp the attempt counter BEFORE invoking so repeated
                // rule-creation events can't re-trigger the same batch without
                // bound, even if the invoke below fails.
                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    retry_params: { ...params, rule_retry_count: ruleRetryCount + 1 },
                    notes: `Auto-retried due to new ${event.entity_name} creation (rule retry ${ruleRetryCount + 1}/${MAX_RULE_RETRY_ATTEMPTS})`,
                });

                await base44.asServiceRole.functions.invoke('triggerImport', {
                    import_type: batch.import_type,
                    file_url: batch.file_url,
                    retry_of: batch.id,
                });
                retried.push(batch.id);
            } catch (batchErr) {
                // Isolate per-batch failures so one bad batch doesn't abort the
                // rest of the loop.
                console.error(`onRuleCreated: failed to auto-retry batch ${batch?.id}:`, batchErr);
            }
        }

        return Response.json({ success: true, retried });
    } catch (error) {
        console.error('Error in onRuleCreated:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import {
    MAX_AUTO_RETRY_ATTEMPTS,
    extractErrorMessage,
    shouldRetryBatch,
} from './helpers.ts';

// Auto-retry worker for FAILED import batches whose error categorization marks
// the failure as transient (network errors, rate limits, timeouts).
//
// Complement to autoResumePausedImports: that function handles batches that
// paused mid-run and have a saved offset. This one handles batches that
// failed outright but where the failure looks recoverable. Together they
// close the loop on the retryable/suggested_action fields in errorCategories.jsx.
//
// Bounded by MAX_AUTO_RETRY_ATTEMPTS per batch with exponential backoff so a
// chronically broken upstream can't burn through API/LLM credits.
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const serviceSecret = Deno.env.get('AUTO_RETRY_FAILED_IMPORTS_SECRET');
        const providedServiceSecret = req.headers.get('x-auto-retry-secret');

        let user = null;
        try {
            user = await base44.auth.me();
        } catch (_e) {
            user = null;
        }

        const isAdmin = user?.role === 'admin';
        const hasValidServiceCredential =
            !!serviceSecret &&
            !!providedServiceSecret &&
            providedServiceSecret === serviceSecret;

        if (!user && !hasValidServiceCredential) {
            return Response.json(
                { error: 'Unauthorized: Admin authentication or valid service credential required' },
                { status: 401 },
            );
        }

        if (user && !isAdmin && !hasValidServiceCredential) {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const failedBatches = await base44.asServiceRole.entities.ImportBatch.filter(
            { status: 'failed' },
            '-updated_date',
            50,
        );

        const now = new Date();
        const retried: Array<{ id: string; type: string; attempt: number }> = [];
        const skipped: Array<{ id: string; reason: string }> = [];
        const errors: Array<{ id: string; error: string }> = [];

        for (const batch of failedBatches) {
            const decision = shouldRetryBatch(batch, now);
            if (!decision.eligible) {
                skipped.push({ id: batch.id, reason: decision.reason });
                continue;
            }

            const nextAttempt = decision.attemptCount + 1;
            const params = batch.retry_params || {};

            try {
                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    retry_params: {
                        ...params,
                        auto_retry_count: nextAttempt,
                        last_auto_retry_at: now.toISOString(),
                        last_auto_retry_reason: extractErrorMessage(batch).substring(0, 200),
                    },
                });

                await base44.asServiceRole.functions.invoke('triggerImport', {
                    import_type: batch.import_type,
                    file_url: batch.file_url,
                    year: batch.data_year,
                    dry_run: false,
                    retry_of: batch.id,
                    retry_count: nextAttempt,
                    retry_tags: ['auto_retry_failed'],
                });

                retried.push({ id: batch.id, type: batch.import_type, attempt: nextAttempt });
            } catch (err) {
                errors.push({ id: batch.id, error: err.message });
            }
        }

        return Response.json({
            success: true,
            scanned: failedBatches.length,
            retried_count: retried.length,
            retried,
            skipped,
            errors,
            max_attempts: MAX_AUTO_RETRY_ATTEMPTS,
        });
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
    }
});

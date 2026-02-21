import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const MAX_EXEC_MS = 50000;
const execStart = Date.now();
function timeLeft() { return MAX_EXEC_MS - (Date.now() - execStart); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { mode = 'unverified', batch_size = 10, filter_status } = await req.json();

    // Build filter based on mode
    let filter = {};
    if (mode === 'unverified') {
      // Providers with email but never analyzed
      filter = { email: { $ne: null } };
    } else if (mode === 'risky') {
      filter = { email_validation_status: 'risky' };
    } else if (mode === 'invalid') {
      filter = { email_validation_status: 'invalid' };
    } else if (mode === 'reverify') {
      // Re-verify risky + invalid
      filter = { email_validation_status: { $in: ['risky', 'invalid'] } };
    }

    const candidates = await base44.asServiceRole.entities.Provider.filter(filter, '-created_date', 500);

    // Filter further: must have email, and for unverified mode skip already analyzed
    let toVerify = candidates.filter(p => p.email && p.email.trim());
    if (mode === 'unverified') {
      toVerify = toVerify.filter(p => !p.email_analyzed_at);
    }

    // Take batch
    const batch = toVerify.slice(0, Math.min(batch_size, 25));

    const results = [];
    let verified = 0;
    let failed = 0;

    for (const provider of batch) {
      if (timeLeft() < 8000) break; // Reserve time for response

      try {
        const resp = await base44.functions.invoke('verifyProviderEmail', {
          provider_id: provider.id,
        });

        results.push({
          npi: provider.npi,
          name: provider.entity_type === 'Individual'
            ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
            : provider.organization_name || provider.npi,
          email: provider.email,
          status: resp.data?.status || 'unknown',
          score: resp.data?.score || 0,
          confidence: resp.data?.confidence || 'low',
          recommendation: resp.data?.recommendation || null,
        });
        verified++;
      } catch (e) {
        console.error(`Verify failed for ${provider.npi}:`, e.message);
        results.push({
          npi: provider.npi,
          email: provider.email,
          status: 'error',
          error: e.message,
        });
        failed++;
      }
    }

    return Response.json({
      success: true,
      mode,
      total_candidates: toVerify.length,
      batch_processed: batch.length,
      verified,
      failed,
      remaining: Math.max(0, toVerify.length - batch.length),
      results,
    });

  } catch (error) {
    console.error('bulkVerifyEmails error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
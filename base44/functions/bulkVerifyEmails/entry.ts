import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const MAX_EXEC_MS = 50000;
const execStart = Date.now();
function timeLeft() { return MAX_EXEC_MS - (Date.now() - execStart); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { mode = 'unverified', batch_size = 10, filter_status, npis } = await req.json();

    let toVerify = [];

    if (mode === 'specific_npis' && npis && npis.length > 0) {
      // Re-verify specific providers by NPI list
      for (let i = 0; i < npis.length; i += 50) {
        const chunk = npis.slice(i, i + 50);
        for (const npi of chunk) {
          const found = await base44.asServiceRole.entities.Provider.filter({ npi }, '-created_date', 1);
          if (found.length > 0 && found[0].email) {
            toVerify.push(found[0]);
          }
        }
      }
    } else {
      // Build filter based on mode
      let filter = {};
      if (mode === 'unverified') {
        filter = { email: { $ne: null } };
      } else if (mode === 'risky') {
        filter = { email_validation_status: 'risky' };
      } else if (mode === 'invalid') {
        filter = { email_validation_status: 'invalid' };
      } else if (mode === 'reverify') {
        filter = { email_validation_status: { $in: ['risky', 'invalid'] } };
      }

      const candidates = await base44.asServiceRole.entities.Provider.filter(filter, '-created_date', 500);
      toVerify = candidates.filter(p => p.email && p.email.trim());
      if (mode === 'unverified') {
        // Unverified = has email but no validation status yet
        toVerify = toVerify.filter(p => !p.email_validation_status || p.email_validation_status === '');
      }
    }

    // Take batch
    const maxBatch = mode === 'specific_npis' ? Math.min(toVerify.length, 50) : Math.min(batch_size, 25);
    const batch = toVerify.slice(0, maxBatch);

    const results = [];
    let verified = 0;
    let failed = 0;

    for (const provider of batch) {
      if (timeLeft() < 8000) break; // Reserve time for response

      try {
        const resp = await base44.functions.invoke('verifyProviderEmail', {
          provider_id: provider.id,
        });

        const d = resp.data || {};
        results.push({
          npi: provider.npi,
          name: provider.entity_type === 'Individual'
            ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
            : provider.organization_name || provider.npi,
          email: provider.email,
          status: d.status || 'unknown',
          score: d.score || 0,
          confidence: d.confidence || 'low',
          recommendation: d.recommendation || null,
          dns: d.dns || null,
          smtp: d.smtp || null,
          catchAll: d.catchAll || null,
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
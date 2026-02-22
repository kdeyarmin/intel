import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Use small sample-based counting to avoid memory limits
        async function sampleCount(entity, sampleSize = 500) {
            const items = await base44.asServiceRole.entities[entity].list('-created_date', sampleSize);
            return items.length;
        }

        const [providers, locations, referrals, utilization, taxonomies] = await Promise.all([
            base44.asServiceRole.entities.Provider.list('-created_date', 500),
            sampleCount('ProviderLocation'),
            sampleCount('CMSReferral'),
            sampleCount('CMSUtilization'),
            sampleCount('ProviderTaxonomy'),
        ]);

        const totalProviders = providers.length;

        // Email stats from the loaded providers
        let withEmail = 0, emailSearched = 0, emailValid = 0, emailRisky = 0, emailInvalid = 0, needsEnrichment = 0;
        for (const p of providers) {
            if (p.email) withEmail++;
            if (p.email_searched_at) emailSearched++;
            if (p.email_validation_status === 'valid') emailValid++;
            if (p.email_validation_status === 'risky') emailRisky++;
            if (p.email_validation_status === 'invalid') emailInvalid++;
            if (p.needs_nppes_enrichment) needsEnrichment++;
        }

        const emailStats = {
            withEmail,
            searched: emailSearched,
            valid: emailValid,
            risky: emailRisky,
            invalid: emailInvalid,
            needsEnrichment,
            isEstimated: totalProviders >= 500,
        };

        // Top states
        const stateCounts = {};
        const locs = await base44.asServiceRole.entities.ProviderLocation.list('-created_date', 500);
        for (const loc of locs) {
            if (loc.state) {
                const st = loc.state.trim().toUpperCase();
                if (st.length === 2) stateCounts[st] = (stateCounts[st] || 0) + 1;
            }
        }
        const topStates = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

        // Import batches
        const batches = await base44.asServiceRole.entities.ImportBatch.list('-created_date', 100);
        const lastCompleted = batches.find(b => b.status === 'completed');
        const lastRefresh = lastCompleted?.completed_at || lastCompleted?.created_date || null;

        const activeBatches = batches.filter(b => b.status === 'processing' || b.status === 'validating').length;
        const completedBatches = batches.filter(b => b.status === 'completed').length;
        const failedBatches = batches.filter(b => b.status === 'failed').length;

        // Latest quality scan
        const dqScans = await base44.asServiceRole.entities.DataQualityScan.list('-created_date', 1);
        const latestScan = dqScans[0] || null;

        let openAlerts = 0;
        try {
            const alerts = await base44.asServiceRole.entities.DataQualityAlert.filter({ status: 'new' }, '-created_date', 100);
            openAlerts = alerts.length;
        } catch (e) { /* ignore */ }

        return Response.json({
            totalProviders,
            totalLocations: locs.length,
            totalReferrals: referrals,
            totalUtilization: utilization,
            totalTaxonomies: taxonomies,
            emailStats,
            topStates,
            lastRefresh,
            imports: { active: activeBatches, completed: completedBatches, failed: failedBatches },
            dataQuality: latestScan ? {
                score: latestScan.completeness_score || 0,
                scanDate: latestScan.created_date,
                totalRecords: latestScan.total_records || 0,
            } : null,
            openAlerts,
        });

    } catch (error) {
        console.error('getDashboardStats error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
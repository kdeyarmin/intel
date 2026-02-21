import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Count entities by paginating
        async function countEntity(entity) {
            const PAGE = 5000;
            let total = 0;
            let skip = 0;
            while (true) {
                const page = await base44.asServiceRole.entities[entity].list('-created_date', PAGE, skip);
                total += page.length;
                if (page.length < PAGE) break;
                skip += PAGE;
                if (skip > 500000) break;
            }
            return total;
        }

        // Count with filter (smaller sets)
        async function countFiltered(entity, filter) {
            const results = await base44.asServiceRole.entities[entity].filter(filter, '-created_date', 5000);
            return results.length;
        }

        const [totalProviders, totalLocations, totalReferrals, totalUtilization, totalTaxonomies] = await Promise.all([
            countEntity('Provider'),
            countEntity('ProviderLocation'),
            countEntity('CMSReferral'),
            countEntity('CMSUtilization'),
            countEntity('ProviderTaxonomy'),
        ]);

        // Email stats from a sample (fast)
        let emailSample = await base44.asServiceRole.entities.Provider.list('-created_date', 5000);
        if (!Array.isArray(emailSample)) emailSample = [];
        const withEmail = emailSample.filter(p => p.email).length;
        const emailSearched = emailSample.filter(p => p.email_searched_at).length;
        const emailValid = emailSample.filter(p => p.email_validation_status === 'valid').length;
        const emailRisky = emailSample.filter(p => p.email_validation_status === 'risky').length;
        const emailInvalid = emailSample.filter(p => p.email_validation_status === 'invalid').length;
        const needsEnrichment = emailSample.filter(p => p.needs_nppes_enrichment).length;
        const sampleSize = emailSample.length;

        // Scale email stats to total if sample < total
        const scale = totalProviders > 0 && sampleSize > 0 ? totalProviders / sampleSize : 1;
        const emailStats = {
            withEmail: sampleSize === totalProviders ? withEmail : Math.round(withEmail * scale),
            searched: sampleSize === totalProviders ? emailSearched : Math.round(emailSearched * scale),
            valid: sampleSize === totalProviders ? emailValid : Math.round(emailValid * scale),
            risky: sampleSize === totalProviders ? emailRisky : Math.round(emailRisky * scale),
            invalid: sampleSize === totalProviders ? emailInvalid : Math.round(emailInvalid * scale),
            needsEnrichment: sampleSize === totalProviders ? needsEnrichment : Math.round(needsEnrichment * scale),
            sampleSize,
            isEstimated: sampleSize < totalProviders,
        };

        // Top states from import batches
        const stateCounts = {};
        const batches = await base44.asServiceRole.entities.ImportBatch.list('-created_date', 500);
        for (const batch of batches) {
            if (batch.status !== 'completed') continue;
            if (batch.file_name) {
                const match = batch.file_name.match(/crawler_([A-Z]{2})_/);
                if (match) {
                    const state = match[1];
                    const imported = batch.imported_rows || batch.valid_rows || 0;
                    stateCounts[state] = (stateCounts[state] || 0) + imported;
                }
            }
        }
        const topStates = Object.entries(stateCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Last refresh
        const recentBatches = batches.slice(0, 10);
        const lastCompleted = recentBatches.find(b => b.status === 'completed');
        const lastRefresh = lastCompleted?.completed_at || lastCompleted?.created_date || null;

        // Import stats
        const activeBatches = batches.filter(b => b.status === 'processing' || b.status === 'validating').length;
        const completedBatches = batches.filter(b => b.status === 'completed').length;
        const failedBatches = batches.filter(b => b.status === 'failed').length;

        // Latest quality scan
        const dqScans = await base44.asServiceRole.entities.DataQualityScan.list('-created_date', 1);
        const latestScan = dqScans[0] || null;

        // Open alerts count
        let openAlerts = 0;
        try {
            const alerts = await base44.asServiceRole.entities.DataQualityAlert.filter({ status: 'new' }, '-created_date', 100);
            openAlerts = alerts.length;
        } catch (e) { /* ignore */ }

        return Response.json({
            // Core counts
            totalProviders,
            totalLocations,
            totalReferrals,
            totalUtilization,
            totalTaxonomies,
            // Email health
            emailStats,
            // Geography
            topStates,
            // Freshness
            lastRefresh,
            // Import health
            imports: { active: activeBatches, completed: completedBatches, failed: failedBatches },
            // Data quality summary
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
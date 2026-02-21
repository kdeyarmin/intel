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

        // Email stats from a sample (fast) — use smaller batch to avoid issues
        let emailSample = [];
        try {
            const batch1 = await base44.asServiceRole.entities.Provider.list('-created_date', 1000);
            if (Array.isArray(batch1)) emailSample = batch1;
        } catch (e) {
            console.warn('Email sample fetch failed:', e.message);
        }

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

        // Top states by actual provider location counts
        const stateCounts = {};
        let locSkip = 0;
        const LOC_PAGE = 5000;
        while (true) {
            const locs = await base44.asServiceRole.entities.ProviderLocation.list('-created_date', LOC_PAGE, locSkip);
            if (!locs || locs.length === 0) break;
            for (const loc of locs) {
                if (loc.state) {
                    const st = loc.state.trim().toUpperCase();
                    if (st.length === 2) {
                        stateCounts[st] = (stateCounts[st] || 0) + 1;
                    }
                }
            }
            if (locs.length < LOC_PAGE) break;
            locSkip += LOC_PAGE;
            if (locSkip > 200000) break; // safety cap
        }
        const topStates = Object.entries(stateCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Import batches for freshness & health
        const batches = await base44.asServiceRole.entities.ImportBatch.list('-created_date', 500);

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
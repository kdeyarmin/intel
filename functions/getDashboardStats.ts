import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Fetch one page per entity. If we get exactly PAGE_SIZE, the real total is likely higher.
        const PAGE = 500;

        const [providers, locations, referrals, utilization, taxonomies, batches, dqScans] = await Promise.all([
            base44.asServiceRole.entities.Provider.list('-created_date', PAGE),
            base44.asServiceRole.entities.ProviderLocation.list('-created_date', PAGE),
            base44.asServiceRole.entities.CMSReferral.list('-created_date', PAGE),
            base44.asServiceRole.entities.CMSUtilization.list('-created_date', PAGE),
            base44.asServiceRole.entities.ProviderTaxonomy.list('-created_date', PAGE),
            base44.asServiceRole.entities.ImportBatch.list('-created_date', 100),
            base44.asServiceRole.entities.DataQualityScan.list('-created_date', 1),
        ]);

        // Provider email stats
        let withEmail = 0, searched = 0, valid = 0, risky = 0, invalid = 0, needsEnrichment = 0;
        for (const p of providers) {
            if (p.email) withEmail++;
            if (p.email_searched_at) searched++;
            if (p.email_validation_status === 'valid') valid++;
            if (p.email_validation_status === 'risky') risky++;
            if (p.email_validation_status === 'invalid') invalid++;
            if (p.needs_nppes_enrichment) needsEnrichment++;
        }

        const hasManyProviders = providers.length >= PAGE;
        const hasManyLocations = locations.length >= PAGE;
        const hasManyReferrals = referrals.length >= PAGE;
        const hasManyUtilization = utilization.length >= PAGE;
        const hasManyTaxonomies = taxonomies.length >= PAGE;
        const hasAnyTruncated = hasManyProviders || hasManyLocations || hasManyReferrals || hasManyUtilization || hasManyTaxonomies;

        // If provider list was truncated, try to get a second page just for a better count
        let totalProviders = providers.length;
        if (hasManyProviders) {
            const page2 = await base44.asServiceRole.entities.Provider.list('-created_date', PAGE, PAGE);
            totalProviders += page2.length;
            for (const p of page2) {
                if (p.email) withEmail++;
                if (p.email_searched_at) searched++;
                if (p.email_validation_status === 'valid') valid++;
                if (p.email_validation_status === 'risky') risky++;
                if (p.email_validation_status === 'invalid') invalid++;
                if (p.needs_nppes_enrichment) needsEnrichment++;
            }
        }

        // Top states
        const stateCounts = {};
        for (const loc of locations) {
            if (loc.state) {
                const st = loc.state.trim().toUpperCase();
                if (st.length === 2) stateCounts[st] = (stateCounts[st] || 0) + 1;
            }
        }
        const topStates = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

        // Import health
        const lastCompleted = batches.find(b => b.status === 'completed');
        const lastRefresh = lastCompleted?.completed_at || lastCompleted?.created_date || null;
        const activeBatches = batches.filter(b => b.status === 'processing' || b.status === 'validating').length;
        const completedBatches = batches.filter(b => b.status === 'completed').length;
        const failedBatches = batches.filter(b => b.status === 'failed').length;

        // Data quality
        const latestScan = dqScans[0] || null;

        let openAlerts = 0;
        try {
            const alerts = await base44.asServiceRole.entities.DataQualityAlert.filter({ status: 'new' }, '-created_date', 100);
            openAlerts = alerts.length;
        } catch (e) { /* ignore */ }

        return Response.json({
            totalProviders,
            totalLocations: locations.length,
            totalReferrals: referrals.length,
            totalUtilization: utilization.length,
            totalTaxonomies: taxonomies.length,
            isEstimatedCounts: hasAnyTruncated,
            emailStats: {
                withEmail,
                searched,
                valid,
                risky,
                invalid,
                needsEnrichment,
                isEstimated: hasManyProviders,
            },
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
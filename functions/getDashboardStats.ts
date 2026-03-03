import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Real totals usually require .count() or similar, but since we can't reliably get full counts fast without a specific query, we'll try to fetch more pages to get a better estimate.
        // We can do an empty filter to get all records, but there's a limit. 
        // Using a high limit to get actual totals for the dashboard
        const LIMIT = 10000; 

        // Fetch sequentially to prevent rate limits
        const providers = await base44.asServiceRole.entities.Provider.filter({}, undefined, LIMIT);
        const locations = await base44.asServiceRole.entities.ProviderLocation.filter({}, undefined, LIMIT);
        const referrals = await base44.asServiceRole.entities.CMSReferral.filter({}, undefined, LIMIT);
        const utilization = await base44.asServiceRole.entities.CMSUtilization.filter({}, undefined, LIMIT);
        const taxonomies = await base44.asServiceRole.entities.ProviderTaxonomy.filter({}, undefined, LIMIT);
        const batches = await base44.asServiceRole.entities.ImportBatch.list('-created_date', 100);
        const dqScans = await base44.asServiceRole.entities.DataQualityScan.list('-created_date', 1);

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

        const hasManyProviders = providers.length >= LIMIT;
        const hasManyLocations = locations.length >= LIMIT;
        const hasManyReferrals = referrals.length >= LIMIT;
        const hasManyUtilization = utilization.length >= LIMIT;
        const hasManyTaxonomies = taxonomies.length >= LIMIT;
        const hasAnyTruncated = hasManyProviders || hasManyLocations || hasManyReferrals || hasManyUtilization || hasManyTaxonomies;

        let totalProviders = providers.length;

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
            samples: {
                providers: providers.slice(0, 200),
                locations: locations.slice(0, 200),
                referrals: referrals.slice(0, 200),
                utilizations: utilization.slice(0, 200),
            },
        });

    } catch (error) {
        console.error('getDashboardStats error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
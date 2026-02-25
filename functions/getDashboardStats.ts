import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const PAGE = 500;

async function countAllRecords(entity) {
    let offset = 0;
    let total = 0;
    while (true) {
        const page = await entity.list('-created_date', PAGE, offset);
        total += page.length;
        if (page.length < PAGE) break;
        offset += PAGE;
    }
    return total;
}

async function fetchAllRecords(entity, maxPages = 20) {
    let offset = 0;
    const allRecords = [];
    for (let p = 0; p < maxPages; p++) {
        const page = await entity.list('-created_date', PAGE, offset);
        allRecords.push(...page);
        if (page.length < PAGE) break;
        offset += PAGE;
    }
    return allRecords;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const [
            totalLocations,
            totalReferrals,
            totalUtilization,
            totalTaxonomies,
        ] = await Promise.all([
            countAllRecords(base44.asServiceRole.entities.ProviderLocation),
            countAllRecords(base44.asServiceRole.entities.CMSReferral),
            countAllRecords(base44.asServiceRole.entities.CMSUtilization),
            countAllRecords(base44.asServiceRole.entities.ProviderTaxonomy),
        ]);

        const providers = await fetchAllRecords(base44.asServiceRole.entities.Provider);
        const totalProviders = providers.length;

        let withEmail = 0, searched = 0, valid = 0, risky = 0, invalid = 0, needsEnrichment = 0;
        for (const p of providers) {
            if (p.email) withEmail++;
            if (p.email_searched_at) searched++;
            if (p.email_validation_status === 'valid') valid++;
            if (p.email_validation_status === 'risky') risky++;
            if (p.email_validation_status === 'invalid') invalid++;
            if (p.needs_nppes_enrichment) needsEnrichment++;
        }

        const locations = await fetchAllRecords(base44.asServiceRole.entities.ProviderLocation, 4);
        const stateCounts = {};
        for (const loc of locations) {
            if (loc.state) {
                const st = loc.state.trim().toUpperCase();
                if (st.length === 2) stateCounts[st] = (stateCounts[st] || 0) + 1;
            }
        }
        const topStates = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

        const batches = await base44.asServiceRole.entities.ImportBatch.list('-created_date', 100);
        const lastCompleted = batches.find(b => b.status === 'completed');
        const lastRefresh = lastCompleted?.completed_at || lastCompleted?.created_date || null;
        const activeBatches = batches.filter(b => b.status === 'processing' || b.status === 'validating').length;
        const completedBatches = batches.filter(b => b.status === 'completed').length;
        const failedBatches = batches.filter(b => b.status === 'failed').length;

        let latestScan = null;
        try {
            const dqScans = await base44.asServiceRole.entities.DataQualityScan.list('-created_date', 1);
            latestScan = dqScans[0] || null;
        } catch (e) { /* ignore */ }

        let openAlerts = 0;
        try {
            const alerts = await base44.asServiceRole.entities.DataQualityAlert.filter({ status: 'new' }, '-created_date', 100);
            openAlerts = alerts.length;
        } catch (e) { /* ignore */ }

        return Response.json({
            totalProviders,
            totalLocations,
            totalReferrals,
            totalUtilization,
            totalTaxonomies,
            isEstimatedCounts: false,
            emailStats: {
                withEmail,
                searched,
                valid,
                risky,
                invalid,
                needsEnrichment,
                isEstimated: false,
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
            },
        });

    } catch (error) {
        console.error('getDashboardStats error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

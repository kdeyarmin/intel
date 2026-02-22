import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Paginate to get accurate total count without loading all data into memory at once
        async function countEntity(entity, pageSize = 500) {
            let total = 0;
            let skip = 0;
            while (true) {
                const page = await base44.asServiceRole.entities[entity].list('-created_date', pageSize, skip);
                total += page.length;
                if (page.length < pageSize) break;
                skip += pageSize;
                if (skip > 200000) break;
            }
            return total;
        }

        // For providers we need both count and field-level stats, so load all in pages
        let allProviderStats = { total: 0, withEmail: 0, searched: 0, valid: 0, risky: 0, invalid: 0, needsEnrichment: 0 };
        let provSkip = 0;
        const PROV_PAGE = 500;
        while (true) {
            const batch = await base44.asServiceRole.entities.Provider.list('-created_date', PROV_PAGE, provSkip);
            if (!batch || batch.length === 0) break;
            allProviderStats.total += batch.length;
            for (const p of batch) {
                if (p.email) allProviderStats.withEmail++;
                if (p.email_searched_at) allProviderStats.searched++;
                if (p.email_validation_status === 'valid') allProviderStats.valid++;
                if (p.email_validation_status === 'risky') allProviderStats.risky++;
                if (p.email_validation_status === 'invalid') allProviderStats.invalid++;
                if (p.needs_nppes_enrichment) allProviderStats.needsEnrichment++;
            }
            if (batch.length < PROV_PAGE) break;
            provSkip += PROV_PAGE;
            if (provSkip > 200000) break;
        }

        // Count other entities in parallel (paginated)
        const [totalLocations, totalReferrals, totalUtilization, totalTaxonomies] = await Promise.all([
            countEntity('ProviderLocation'),
            countEntity('CMSReferral'),
            countEntity('CMSUtilization'),
            countEntity('ProviderTaxonomy'),
        ]);

        // Top states from locations (sample 500 is fine for distribution)
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
            totalProviders: allProviderStats.total,
            totalLocations,
            totalReferrals,
            totalUtilization,
            totalTaxonomies,
            emailStats: {
                withEmail: allProviderStats.withEmail,
                searched: allProviderStats.searched,
                valid: allProviderStats.valid,
                risky: allProviderStats.risky,
                invalid: allProviderStats.invalid,
                needsEnrichment: allProviderStats.needsEnrichment,
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
        });

    } catch (error) {
        console.error('getDashboardStats error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Count entities by paginating until we get fewer than the limit
        async function countEntity(entity) {
            const PAGE = 5000;
            let total = 0;
            let skip = 0;
            while (true) {
                const page = await base44.asServiceRole.entities[entity].list('-created_date', PAGE, skip);
                total += page.length;
                if (page.length < PAGE) break;
                skip += PAGE;
                // Safety cap to avoid infinite loops
                if (skip > 500000) break;
            }
            return total;
        }

        const [totalProviders, totalLocations, totalReferrals, activeMedicareProviders] = await Promise.all([
            countEntity('Provider'),
            countEntity('ProviderLocation'),
            countEntity('CMSReferral'),
            countEntity('CMSUtilization'),
        ]);

        // Build top states from import batches (faster than scanning all locations)
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

        // Find last refresh from most recent completed batch
        const recentBatches = await base44.asServiceRole.entities.ImportBatch.list('-created_date', 10);
        const lastCompleted = recentBatches.find(b => b.status === 'completed');
        const lastRefresh = lastCompleted?.completed_at || lastCompleted?.created_date || null;

        return Response.json({
            totalProviders,
            totalLocations,
            totalReferrals,
            activeMedicareProviders,
            lastRefresh,
            topStates,
        });

    } catch (error) {
        console.error('getDashboardStats error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
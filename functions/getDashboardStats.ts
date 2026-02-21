import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Fetch batches to aggregate stats
        // We need to paginate to get all batches if > 50
        const BATCH_SIZE = 1000;
        let allBatches = [];
        let skip = 0;
        while (true) {
            const batches = await base44.asServiceRole.entities.ImportBatch.list('-created_date', BATCH_SIZE, skip);
            if (batches.length === 0) break;
            allBatches = allBatches.concat(batches);
            if (batches.length < BATCH_SIZE) break;
            skip += BATCH_SIZE;
        }

        // Get actual counts directly from entities instead of summing batches
        const [allProviders, allLocations, allReferrals, allUtilization] = await Promise.all([
            base44.asServiceRole.entities.Provider.list('-created_date', 1),
            base44.asServiceRole.entities.ProviderLocation.list('-created_date', 1),
            base44.asServiceRole.entities.CMSReferral.list('-created_date', 1),
            base44.asServiceRole.entities.CMSUtilization.list('-created_date', 1),
        ]);

        const stats = {
            totalProviders: allProviders?.totalCount || 0,
            totalLocations: allLocations?.totalCount || 0,
            totalReferrals: allReferrals?.totalCount || 0,
            activeMedicareProviders: allUtilization?.totalCount || 0,
            lastRefresh: null,
            topStates: {}
        };

        // Find last refresh (most recent completed batch)
        const lastBatch = allBatches.find(b => b.status === 'completed');
        if (lastBatch) {
            stats.lastRefresh = lastBatch.created_date;
        }

        for (const batch of allBatches) {
            if (batch.status !== 'completed') continue;
                
                // Extract locations count from dedup_summary if available
                if (batch.dedup_summary && batch.dedup_summary.locations) {
                    stats.totalLocations += (batch.dedup_summary.locations.created || 0);
                } else {
                    // Fallback estimate if summary missing
                    stats.totalLocations += (batch.imported_locations || imported); 
                }

                // Top states from file name
                if (batch.file_name) {
                    const match = batch.file_name.match(/crawler_([A-Z]{2})_/);
                    if (match) {
                        const state = match[1];
                        if (!stats.topStates[state]) stats.topStates[state] = 0;
                        stats.topStates[state] += imported;
                    }
                }
            } else if (batch.import_type === 'cms_utilization') {
                // (actual count now fetched directly above)
            } else if (batch.import_type === 'cms_order_referring') {
                // (actual count now fetched directly above)
            }
        }

        // Sort top states
        const topStatesArr = Object.entries(stats.topStates)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        return Response.json({
            ...stats,
            topStates: topStatesArr
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
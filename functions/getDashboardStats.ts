import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        // Allow public read if needed or restrict. Dashboard is usually authenticated.
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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

        const stats = {
            totalProviders: 0,
            totalLocations: 0,
            totalReferrals: 0,
            activeMedicareProviders: 0, // approximation
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

            const imported = batch.imported_rows || 0;
            
            if (batch.import_type === 'nppes_registry') {
                stats.totalProviders += imported;
                
                // Extract locations count from dedup_summary if available
                if (batch.dedup_summary && batch.dedup_summary.locations) {
                    stats.totalLocations += (batch.dedup_summary.locations.created || 0);
                } else {
                    // Fallback estimate if summary missing (rare for new batches)
                    // Locations usually 1:1 or 1:2 with providers
                    // But imported_rows is providers. 
                    // Let's assume imported_locations field if exists in older schema
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
                // approximate active medicare providers count by number of utilization records
                // (usually 1 record per provider per year)
                stats.activeMedicareProviders += imported;
            } else if (batch.import_type === 'cms_order_referring') {
                stats.totalReferrals += imported;
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
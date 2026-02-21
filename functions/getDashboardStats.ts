import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Fetch actual entity counts by listing records
        // Use larger limits to get real counts
        const [providers, locations, referrals, utilization] = await Promise.all([
            base44.asServiceRole.entities.Provider.list('-created_date', 5000),
            base44.asServiceRole.entities.ProviderLocation.list('-created_date', 5000),
            base44.asServiceRole.entities.CMSReferral.list('-created_date', 5000),
            base44.asServiceRole.entities.CMSUtilization.list('-created_date', 5000),
        ]);

        const totalProviders = providers.length;
        const totalLocations = locations.length;
        const totalReferrals = referrals.length;
        const activeMedicareProviders = utilization.length;

        // Build top states from provider locations
        const stateCounts = {};
        for (const loc of locations) {
            const st = loc.state;
            if (st) {
                stateCounts[st] = (stateCounts[st] || 0) + 1;
            }
        }

        // If no locations have state, try providers' locations from batches
        if (Object.keys(stateCounts).length === 0) {
            // Fallback: look at recent import batches to extract state info
            const batches = await base44.asServiceRole.entities.ImportBatch.list('-created_date', 200);
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
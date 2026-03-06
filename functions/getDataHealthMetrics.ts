import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Missing Fields & Stale Providers
        // We fetch a recent sample of 2000 providers to extrapolate metrics
        const providers = await base44.asServiceRole.entities.Provider.list('-created_date', 2000);
        
        let missingSpecialty = 0;
        let missingLocation = 0;
        let missingEmail = 0;
        let staleProviders = 0;
        
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        providers.forEach(p => {
            if (p.needs_specialty_enrichment) missingSpecialty++;
            if (p.needs_location_enrichment) missingLocation++;
            if (!p.email) missingEmail++;
            
            if (p.last_update_date) {
                const updated = new Date(p.last_update_date);
                if (updated < sixMonthsAgo) staleProviders++;
            } else {
                staleProviders++;
            }
        });
        
        const totalSample = providers.length || 1; // Prevent division by zero
        
        const missingFieldsData = [
            { name: 'Specialty', missing: Math.round((missingSpecialty / totalSample) * 100) },
            { name: 'Location', missing: Math.round((missingLocation / totalSample) * 100) },
            { name: 'Email', missing: Math.round((missingEmail / totalSample) * 100) },
        ];
        
        const staleData = [
            { name: 'Stale (6m+)', value: staleProviders },
            { name: 'Fresh', value: Math.max(0, providers.length - staleProviders) }
        ];

        // 2. Recent Error Rates by Import Type
        const recentBatches = await base44.asServiceRole.entities.ImportBatch.list('-created_date', 200);
        
        const errorRatesByType = {};
        
        recentBatches.forEach(b => {
            if (!b.import_type) return;
            if (!errorRatesByType[b.import_type]) {
                errorRatesByType[b.import_type] = { type: b.import_type, totalRows: 0, invalidRows: 0 };
            }
            errorRatesByType[b.import_type].totalRows += (b.total_rows || 0);
            errorRatesByType[b.import_type].invalidRows += (b.invalid_rows || 0);
        });
        
        const errorRates = Object.values(errorRatesByType).map(rate => ({
            name: rate.type,
            errorRate: rate.totalRows > 0 ? Number(((rate.invalidRows / rate.totalRows) * 100).toFixed(2)) : 0
        })).sort((a, b) => b.errorRate - a.errorRate).slice(0, 10);

        return Response.json({
            missingFieldsData,
            staleData,
            errorRates,
            totalSampled: providers.length
        });
        
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const today = new Date().toISOString().split('T')[0];

        // Check if we already have a snapshot for today
        const existing = await base44.asServiceRole.entities.ImportMetrics.filter({ snapshot_date: today });
        
        // Gather current counts
        const providers = await base44.asServiceRole.entities.Provider.list();
        const locations = await base44.asServiceRole.entities.ProviderLocation.list();
        const taxonomies = await base44.asServiceRole.entities.ProviderTaxonomy.list();
        const utilization = await base44.asServiceRole.entities.CMSUtilization.list();
        const referrals = await base44.asServiceRole.entities.CMSReferral.list();

        const locNPIs = new Set(locations.map(l => l.npi));
        const taxNPIs = new Set(taxonomies.map(t => t.npi));

        const providersWithLoc = providers.filter(p => locNPIs.has(p.npi)).length;
        const providersWithTax = providers.filter(p => taxNPIs.has(p.npi)).length;
        const needEnrichment = providers.filter(p => p.needs_nppes_enrichment).length;

        // Completeness score
        const total = providers.length || 1;
        const hasNPI = providers.filter(p => p.npi && p.npi.trim() !== '').length;
        const hasName = providers.filter(p => (p.first_name && p.last_name) || p.organization_name).length;
        const completeness = Math.round(((hasNPI + hasName + providersWithLoc + providersWithTax) / (total * 4)) * 100);

        // Accuracy score
        const validNPIs = providers.filter(p => {
            if (!p.npi) return false;
            return String(p.npi).replace(/\D/g, '').length === 10;
        }).length;
        const VALID_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP']);
        const validStates = locations.filter(l => l.state && VALID_STATES.has(l.state.toUpperCase())).length;
        const validZips = locations.filter(l => l.zip && /^\d{5}(-\d{4})?$/.test(l.zip.trim())).length;
        const accDenom = providers.length + locations.length + locations.length;
        const accuracy = accDenom > 0 ? Math.round(((validNPIs + validStates + validZips) / accDenom) * 100) : 0;

        // Today's import stats
        const todayStart = new Date(today + 'T00:00:00Z');
        const batches = await base44.asServiceRole.entities.ImportBatch.list('-created_date', 50);
        const todayBatches = batches.filter(b => new Date(b.created_date) >= todayStart);
        const importsToday = todayBatches.length;
        const failedToday = todayBatches.filter(b => b.status === 'failed').length;
        const rowsToday = todayBatches.reduce((sum, b) => sum + (b.imported_rows || 0), 0);

        const metricsData = {
            snapshot_date: today,
            total_providers: providers.length,
            providers_with_location: providersWithLoc,
            providers_with_taxonomy: providersWithTax,
            providers_needing_enrichment: needEnrichment,
            total_locations: locations.length,
            total_utilization_records: utilization.length,
            total_referral_records: referrals.length,
            completeness_score: completeness,
            accuracy_score: accuracy,
            imports_today: importsToday,
            imports_failed_today: failedToday,
            rows_imported_today: rowsToday,
        };

        if (existing.length > 0) {
            await base44.asServiceRole.entities.ImportMetrics.update(existing[0].id, metricsData);
        } else {
            await base44.asServiceRole.entities.ImportMetrics.create(metricsData);
        }

        return Response.json({ success: true, metrics: metricsData });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        let payload = {};
        try { payload = await req.json(); } catch(e) {}
        const { batch_id } = payload;
        if (!batch_id) return Response.json({ error: 'batch_id required' }, { status: 400 });

        const batch = await base44.asServiceRole.entities.ImportBatch.get(batch_id);
        if (!batch) return Response.json({ error: 'batch not found' }, { status: 404 });

        // Extract state from batch file_name (e.g., crawler_NY_all_...)
        const stateMatch = batch.file_name?.match(/crawler_([A-Z]{2})_/);
        const state = stateMatch ? stateMatch[1] : null;

        const alertsToCreate = [];
        const scanBatchId = `nppes_val_${batch_id}`;

        // 1. Data Consistency: Compare with previous run for this state
        if (state) {
            const previousBatches = await base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 50);
            const stateBatches = previousBatches.filter(b => b.file_name?.includes(`crawler_${state}_`) && b.id !== batch_id && b.status === 'completed');
            
            if (stateBatches.length > 0) {
                const prevBatch = stateBatches[0];
                const currentCount = (batch.imported_rows || 0) + (batch.updated_rows || 0) + (batch.skipped_rows || 0);
                const prevCount = (prevBatch.imported_rows || 0) + (prevBatch.updated_rows || 0) + (prevBatch.skipped_rows || 0);
                
                const countDiff = Math.abs(currentCount - prevCount);
                const pctChange = prevCount > 0 ? (countDiff / prevCount) * 100 : 0;
                
                if (pctChange > 15) { // 15% variance threshold
                    alertsToCreate.push({
                        rule_id: 'nppes_consistency', rule_name: 'Significant Variance from Previous Run',
                        category: 'consistency', severity: pctChange > 50 ? 'critical' : 'high', 
                        entity_type: 'ImportBatch', entity_id: batch_id, field_name: 'valid_rows',
                        current_value: String(currentCount),
                        status: 'open', scan_batch_id: scanBatchId,
                        summary: `${state} providers count changed by ${pctChange.toFixed(1)}% compared to previous run (${prevCount} -> ${currentCount})`,
                        affected_count: 1
                    });
                }
            }
        }

        // 2. Data Integrity Checks on recent records
        // Check a sample of recently updated providers
        const recentProviders = await base44.asServiceRole.entities.Provider.list('-updated_date', 200);
        
        for (const p of recentProviders) {
            if (!p.npi || !/^\d{10}$/.test(p.npi)) {
                alertsToCreate.push({
                    rule_id: 'invalid_npi', rule_name: 'Invalid NPI Format', category: 'accuracy', severity: 'critical',
                    entity_type: 'Provider', entity_id: p.id, npi: p.npi, field_name: 'npi',
                    current_value: p.npi || '(empty)', status: 'open', scan_batch_id: scanBatchId,
                    summary: `Invalid NPI format imported: ${p.npi}`, affected_count: 1
                });
            }
        }

        // Check a sample of recent locations for address completeness
        const recentLocations = await base44.asServiceRole.entities.ProviderLocation.list('-updated_date', 200);
        for (const l of recentLocations) {
            if (!l.address_1 || !l.city || !l.state || !l.zip) {
                alertsToCreate.push({
                    rule_id: 'incomplete_address', rule_name: 'Incomplete Address', category: 'completeness', severity: 'medium',
                    entity_type: 'ProviderLocation', entity_id: l.id, npi: l.npi, field_name: 'address',
                    current_value: `${l.address_1}, ${l.city}, ${l.state} ${l.zip}`, status: 'open', scan_batch_id: scanBatchId,
                    summary: `Incomplete address for NPI: ${l.npi}`, affected_count: 1
                });
            }
        }

        // 3. Flagging anomalies using LLM
        const sampleData = {
            batch_stats: {
                state: state || 'Unknown',
                valid_rows: batch.valid_rows,
                invalid_rows: batch.invalid_rows,
                imported: batch.imported_rows,
                updated: batch.updated_rows,
                skipped: batch.skipped_rows,
                errors: batch.error_samples || []
            },
            sample_locations: recentLocations.slice(0, 10).map(l => ({ city: l.city, state: l.state, zip: l.zip }))
        };

        try {
            const prompt = `Analyze this summary of a recently completed NPPES data import batch to identify anomalies. 
Data: ${JSON.stringify(sampleData)}
Return a list of flagged anomalies that might require manual review. For example, if invalid_rows is disproportionately high compared to valid_rows, or if locations are consistently missing fields or states don't match the batch state.`;

            const aiRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        anomalies: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    description: { type: "string" },
                                    severity: { type: "string", enum: ["low", "medium", "high", "critical"] }
                                }
                            }
                        }
                    }
                }
            });

            if (aiRes?.anomalies?.length > 0) {
                for (const anomaly of aiRes.anomalies) {
                    alertsToCreate.push({
                        rule_id: 'ai_anomaly', rule_name: 'AI Detected Import Anomaly', category: 'anomaly', severity: anomaly.severity || 'medium',
                        entity_type: 'ImportBatch', entity_id: batch_id,
                        status: 'open', scan_batch_id: scanBatchId,
                        summary: anomaly.description, affected_count: 1
                    });
                }
            }
        } catch(e) {
            console.warn("AI Anomaly detection failed:", e);
        }

        // Create the alerts in DB
        if (alertsToCreate.length > 0) {
            const toCreate = alertsToCreate.slice(0, 50); // Cap at 50 to avoid payload issues
            await base44.asServiceRole.entities.DataQualityAlert.bulkCreate(toCreate);
        }

        return Response.json({ success: true, alerts_created: Math.min(alertsToCreate.length, 50) });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
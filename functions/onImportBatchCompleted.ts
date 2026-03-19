import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const payload = await req.json();
        const { event, data, old_data, payload_too_large } = payload;
        
        if (event?.type !== 'update' || event?.entity_name !== 'ImportBatch') {
            return Response.json({ success: false, message: 'Ignoring non-update/non-batch event' });
        }

        let batchData = data;
        let oldBatchData = old_data;

        if (payload_too_large) {
            batchData = await base44.asServiceRole.entities.ImportBatch.get(event.entity_id);
        }

        const isNowCompleted = batchData?.status === 'completed';
        const wasCompleted = oldBatchData?.status === 'completed';

        if (!isNowCompleted || (isNowCompleted && wasCompleted && !payload_too_large)) {
            return Response.json({ success: true, message: 'No relevant status transition' });
        }

        const completedImportType = batchData.import_type;
        if (!completedImportType) {
            return Response.json({ success: true, message: 'Batch has no import_type' });
        }

        console.log(`[DependencyManager] Batch completed: ${completedImportType} (${event.entity_id}). Checking for dependent schedules...`);

        const dependentSchedules = await base44.asServiceRole.entities.ImportScheduleConfig.filter({
            is_active: true,
            schedule_frequency: 'on_completion',
            depends_on_import_type: completedImportType
        });

        if (!dependentSchedules || dependentSchedules.length === 0) {
            return Response.json({ success: true, message: `No dependent schedules found for ${completedImportType}` });
        }

        console.log(`[DependencyManager] Found ${dependentSchedules.length} dependent schedules.`);

        const now = new Date();
        const results = [];

        for (const schedule of dependentSchedules) {
            console.log(`[DependencyManager] Triggering dependent schedule: ${schedule.label} (${schedule.import_type})`);

            let runStatus = 'success';
            let runSummary = '';

            try {
                if (schedule.import_type === 'nppes_registry') {
                    const config = schedule.nppes_config || {};
                    const crawlerPayload: any = {
                        action: 'batch_start',
                        dry_run: false,
                        skip_completed: false,
                        taxonomy_description: config.taxonomy_description || '',
                        entity_type: config.entity_type || '',
                    };

                    if (!config.crawl_all_states) {
                        if (!config.state) {
                            throw new Error('Dependent NPPES crawler runs require a state when crawl_all_states is disabled');
                        }
                        crawlerPayload.states = [config.state];
                    }
                    if (config.city) crawlerPayload.city = config.city;
                    if (config.postal_code) crawlerPayload.postal_code = config.postal_code;

                    const res = await base44.asServiceRole.functions.invoke('nppesCrawler', crawlerPayload);
                    const data = res.data || res;
                    runSummary = data.message || `Queued ${data.states_queued || 0} state(s) for crawling (Dependency)`;
                    runStatus = data.error ? 'failed' : 'success';
                } else {
                    const ALIASES = { cms_utilization: 'provider_service_utilization' };
                    const resolvedType = ALIASES[schedule.import_type] || schedule.import_type;
                    
                    const res = await base44.asServiceRole.functions.invoke('triggerImport', {
                        import_type: resolvedType,
                        file_url: schedule.api_url || undefined,
                        year: schedule.data_year || now.getFullYear(),
                        dry_run: false,
                    });
                    
                    const data = res.data?.result || res.data || res;
                    if (data.partial) {
                        runSummary = `Partial: imported ${data.imported_rows || 0} rows, paused at offset ${data.next_offset}. (Dependency)`;
                        runStatus = 'partial';
                    } else {
                        runSummary = `Imported ${data.imported_rows || 0} rows, updated ${data.updated_rows || 0} (Dependency)`;
                        runStatus = 'success';
                    }
                }
            } catch (err) {
                console.error(`[DependencyManager] Failed import ${schedule.import_type}:`, err.message);
                runStatus = 'failed';
                runSummary = `Error: ${err.message}`;
            }

            await base44.asServiceRole.entities.ImportScheduleConfig.update(schedule.id, {
                last_run_at: now.toISOString(),
                last_run_status: runStatus,
                last_run_summary: runSummary,
            });

            results.push({ import_type: schedule.import_type, status: runStatus, summary: runSummary });
        }

        return Response.json({ success: true, triggered: results.length, results });

    } catch (error) {
        console.error('[DependencyManager] Error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TARGETS = [
    {
        type: 'medicare_hha_stats',
        label: 'Medicare HHA Stats',
        page: 'https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-service-type-reports/cms-program-statistics-medicare-home-health-agency',
        year: 2023 // We target the latest year
    },
    {
        type: 'medicare_snf_stats',
        label: 'Medicare SNF Stats',
        page: 'https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-service-type-reports/cms-program-statistics-medicare-skilled-nursing-facility',
        year: 2023
    },
    {
        type: 'medicare_ma_inpatient',
        label: 'Medicare Advantage Inpatient',
        page: 'https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-service-type-reports/cms-program-statistics-medicare-advantage-inpatient-hospital',
        year: 2021
    },
    {
        type: 'medicare_part_d_stats',
        label: 'Medicare Part D Stats',
        page: 'https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-service-type-reports/cms-program-statistics-medicare-part-d',
        year: 2023
    }
];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // Allow scheduled calls (service role) or admin
        let user = null;
        try { user = await base44.auth.me(); } catch (e) {}
        if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

        const results = [];
        
        console.log('Downloading data.json...');
        const resp = await fetch('https://data.cms.gov/data.json');
        if (!resp.ok) throw new Error(`data.json fetch failed: ${resp.status}`);
        const data = await resp.json();
        console.log(`Downloaded data.json with ${data.dataset?.length || 0} datasets.`);

        for (const target of TARGETS) {
            try {
                console.log(`Searching data.json for ${target.label}...`);
                let foundUrl = null;
                const candidates = [];

                // Find the specific dataset by title
                let searchTitle = target.label;
                if (target.type === 'medicare_hha_stats') searchTitle = 'Medicare Home Health Agency';
                if (target.type === 'medicare_snf_stats') searchTitle = 'Medicare Skilled Nursing Facility';
                if (target.type === 'medicare_ma_inpatient') searchTitle = 'Medicare Advantage-Inpatient Hospital';
                if (target.type === 'medicare_part_d_stats') searchTitle = 'Medicare Part D';

                const dataset = data.dataset.find(d => d.title.includes(searchTitle));
                
                if (dataset && dataset.distribution) {
                    const dists = Array.isArray(dataset.distribution) ? dataset.distribution : [dataset.distribution];
                    for (const d of dists) {
                        if (d.downloadURL && (d.downloadURL.endsWith('.zip') || d.downloadURL.endsWith('.xlsx'))) {
                            candidates.push(d.downloadURL);
                        }
                    }
                }

                // Filter candidates for the target year (prioritize exact year match in URL)
                foundUrl = candidates.find(u => u.includes(String(target.year)));
                
                // Fallback: take the first candidate if it looks like a dataset
                if (!foundUrl && candidates.length > 0) {
                    foundUrl = candidates[0];
                }

                // Validate the found URL (head request)
                if (foundUrl) {
                    try {
                        const head = await fetch(foundUrl, { method: 'HEAD' });
                        if (!head.ok) {
                            console.warn(`URL found but not accessible: ${foundUrl} (${head.status})`);
                            foundUrl = null;
                        } else {
                            const size = head.headers.get('content-length');
                            if (size && parseInt(size) < 2000) {
                                console.warn(`URL found but too small (${size} bytes): ${foundUrl}`);
                                foundUrl = null;
                            }
                        }
                    } catch (e) {
                        console.warn(`Error verifying URL ${foundUrl}: ${e.message}`);
                        foundUrl = null;
                    }
                }

                if (foundUrl) {
                    console.log(`Found URL for ${target.type}: ${foundUrl}`);
                    
                    // 1. Update ImportScheduleConfig
                    const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: target.type });
                    let configId = null;
                    
                    if (configs.length > 0) {
                        const config = configs[0];
                        if (config.api_url !== foundUrl) {
                            await base44.asServiceRole.entities.ImportScheduleConfig.update(config.id, { 
                                api_url: foundUrl,
                                last_run_summary: `Auto-updated URL to ${foundUrl}`
                            });
                            results.push({ type: target.type, action: 'updated_config', url: foundUrl });
                        } else {
                            results.push({ type: target.type, action: 'no_change', url: foundUrl });
                        }
                        configId = config.id;
                    } else {
                        // Create if missing
                        const newConfig = await base44.asServiceRole.entities.ImportScheduleConfig.create({
                            import_type: target.type,
                            label: target.label,
                            api_url: foundUrl,
                            schedule_frequency: 'weekly',
                            schedule_time: '02:00'
                        });
                        configId = newConfig.id;
                        results.push({ type: target.type, action: 'created_config', url: foundUrl });
                    }

                    // 2. Update Failed Batches
                    const failedBatches = await base44.asServiceRole.entities.ImportBatch.filter({ 
                        import_type: target.type, 
                        status: 'failed' 
                    });
                    
                    // Filter for batches created in last 48h to avoid noisy updates on old stuff
                    const recentFailed = failedBatches.filter(b => {
                        const created = new Date(b.created_date);
                        return (Date.now() - created.getTime()) < 48 * 60 * 60 * 1000;
                    });

                    for (const batch of recentFailed) {
                        // Check if the URL was different
                        if (batch.file_url !== foundUrl) {
                            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                                cancel_reason: `Auto-detected new URL: ${foundUrl}. Old URL: ${batch.file_url}. PLEASE RETRY THIS BATCH.`,
                                error_samples: [
                                    ...(batch.error_samples || []),
                                    { 
                                        phase: 'url_monitor', 
                                        detail: `New URL detected: ${foundUrl}. Recommended action: Retry this batch.`, 
                                        timestamp: new Date().toISOString(),
                                        category: 'url_update'
                                    }
                                ]
                            });
                            results.push({ type: target.type, action: 'updated_batch', batch_id: batch.id });
                        }
                    }

                } else {
                    console.warn(`No ZIP link found for ${target.type}`);
                    results.push({ type: target.type, action: 'scan_failed', error: 'No ZIP link found in page' });
                }

            } catch (err) {
                console.error(`Error processing ${target.type}:`, err);
                results.push({ type: target.type, action: 'error', error: err.message });
            }
        }

        return Response.json({ success: true, results });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
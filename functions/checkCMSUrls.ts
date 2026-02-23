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

        for (const target of TARGETS) {
            try {
                console.log(`Checking ${target.label} at ${target.page}...`);
                const resp = await fetch(target.page);
                if (!resp.ok) throw new Error(`Page fetch failed: ${resp.status}`);
                const html = await resp.text();

                // Look for ZIP links or XLSX, specifically for the target year if possible
                // Pattern: href="..." containing .zip or .xlsx and maybe the year
                const linkRegex = /href="([^"]+\.(zip|xlsx))"/gi;
                let match;
                let foundUrl = null;
                const candidates = [];

                while ((match = linkRegex.exec(html)) !== null) {
                    const url = match[1];
                    const fullUrl = url.startsWith('http') ? url : `https://data.cms.gov${url.startsWith('/') ? '' : '/'}${url}`;
                    // Filter out non-data links if possible (e.g. documentation)
                    if (!fullUrl.includes('methodology') && !fullUrl.includes('glossary')) {
                        candidates.push(fullUrl);
                    }
                }

                // Filter candidates for the target year
                // Prioritize exact year match in filename
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
                                cancel_reason: `Auto-detected new URL: ${foundUrl}. Old URL: ${batch.file_url}`,
                                error_samples: [
                                    ...(batch.error_samples || []),
                                    { 
                                        phase: 'url_monitor', 
                                        detail: `New URL found: ${foundUrl}`, 
                                        timestamp: new Date().toISOString() 
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
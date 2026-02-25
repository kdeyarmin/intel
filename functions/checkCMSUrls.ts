import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TARGETS = [
    {
        type: 'medicare_hha_stats',
        label: 'Medicare HHA Stats',
        page: 'https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-service-type-reports/cms-program-statistics-medicare-home-health-agency',
        year: 2023
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

async function bruteForcePartDUrls(): Promise<Array<{url: string, type: string}>> {
    const months = ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01'];
    const names = [
        'CPS%20MDCR%20UTLZN%20D%202023.zip',
        'MDCR%20UTLZN%20D%202023.zip',
        'MDCR%20Part%20D%202023.zip',
        'CMS%20Program%20Statistics%20-%20Medicare%20Part%20D%202023.zip'
    ];

    const urls: string[] = [];
    for (const m of months) {
        for (const n of names) {
            urls.push(`https://data.cms.gov/sites/default/files/${m}/${n}`);
        }
    }

    const found: Array<{url: string, type: string}> = [];
    const CHUNK = 5;

    for (let i = 0; i < urls.length; i += CHUNK) {
        const chunk = urls.slice(i, i + CHUNK);
        const promises = chunk.map(async (url) => {
            try {
                const resp = await fetch(url, { method: 'HEAD' });
                if (resp.ok && resp.headers.get('content-type') !== 'text/html') {
                    return { url, type: resp.headers.get('content-type') || 'unknown' };
                }
            } catch(e) {}
            return null;
        });
        const results = await Promise.all(promises);
        results.forEach(r => { if (r) found.push(r); });
        if (found.length > 0) break;
    }

    return found;
}

async function bruteForceSNFUrls(): Promise<Array<{url: string, isZip: boolean}>> {
    const codes = ['01SNF', '02SNF', '03SNF', '04SNF', '05SNF', '06SNF', '07SNF', '08SNF', '09SNF', '10SNF', 'SNF', '01MDCR', '02MDCR'];
    const years = [2023];
    const patterns = [
        (code: string, year: number) => `https://data.cms.gov/sites/default/files/2026-01/MDCR%20SNF_CPS_${code}_${year}.zip`,
        (code: string, year: number) => `https://data.cms.gov/sites/default/files/2026-01/MDCR_SNF_CPS_${code}_${year}.zip`,
        (code: string, year: number) => `https://data.cms.gov/sites/default/files/2026-01/CPS%20MDCR%20SNF%20${year}.zip`,
        (code: string, year: number) => `https://data.cms.gov/sites/default/files/2026-01/MDCR%20SNF%20CPS%20${code}%20${year}.zip`
    ];

    const urls: string[] = [];
    for (const year of years) {
        for (const code of codes) {
            for (const pattern of patterns) {
                urls.push(pattern(code, year));
            }
        }
        urls.push(`https://data.cms.gov/sites/default/files/2026-01/MDCR%20SNF_CPS_${year}.zip`);
    }

    urls.push(`https://data.cms.gov/sites/default/files/2024-10/MDCR%20SNF_CPS_06SNF_2022.zip`);

    const found: Array<{url: string, isZip: boolean}> = [];
    const CHUNK_SIZE = 10;

    for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
        const chunk = urls.slice(i, i + CHUNK_SIZE);
        const promises = chunk.map(async (url) => {
            try {
                const rangeResp = await fetch(url, { headers: { 'Range': 'bytes=0-10' } });
                if (rangeResp.status === 206 || rangeResp.ok) {
                    const buf = await rangeResp.arrayBuffer();
                    const arr = new Uint8Array(buf);
                    const isZip = arr[0] === 0x50 && arr[1] === 0x4B;
                    if (isZip) return { url, isZip: true };
                }
            } catch (e) {}
            return null;
        });

        const chunkResults = await Promise.all(promises);
        const matches = chunkResults.filter(r => r) as Array<{url: string, isZip: boolean}>;
        if (matches.length > 0) return matches;
    }

    return found;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let user = null;
        try { user = await base44.auth.me(); } catch (e) {}
        if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

        const results: any[] = [];

        console.log('Downloading data.json...');
        const resp = await fetch('https://data.cms.gov/data.json');
        if (!resp.ok) throw new Error(`data.json fetch failed: ${resp.status}`);
        const data = await resp.json();
        console.log(`Downloaded data.json with ${data.dataset?.length || 0} datasets.`);

        for (const target of TARGETS) {
            try {
                console.log(`Searching data.json for ${target.label}...`);
                let foundUrl: string | null = null;
                const candidates: string[] = [];

                let searchTitle = target.label;
                if (target.type === 'medicare_hha_stats') searchTitle = 'Medicare Home Health Agency';
                if (target.type === 'medicare_snf_stats') searchTitle = 'Medicare Skilled Nursing Facility';
                if (target.type === 'medicare_ma_inpatient') searchTitle = 'Medicare Advantage-Inpatient Hospital';
                if (target.type === 'medicare_part_d_stats') searchTitle = 'Medicare Part D';

                const dataset = data.dataset.find((d: any) => d.title.includes(searchTitle));

                if (dataset && dataset.distribution) {
                    const dists = Array.isArray(dataset.distribution) ? dataset.distribution : [dataset.distribution];
                    for (const d of dists) {
                        if (d.downloadURL && (d.downloadURL.endsWith('.zip') || d.downloadURL.endsWith('.xlsx'))) {
                            candidates.push(d.downloadURL);
                        }
                    }
                }

                foundUrl = candidates.find(u => u.includes(String(target.year))) || null;

                if (!foundUrl && candidates.length > 0) {
                    foundUrl = candidates[0];
                }

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
                    } catch (e: any) {
                        console.warn(`Error verifying URL ${foundUrl}: ${e.message}`);
                        foundUrl = null;
                    }
                }

                if (!foundUrl) {
                    console.log(`Primary lookup failed for ${target.type}, trying brute-force URL patterns...`);
                    if (target.type === 'medicare_part_d_stats') {
                        const bruteResults = await bruteForcePartDUrls();
                        if (bruteResults.length > 0) {
                            foundUrl = bruteResults[0].url;
                            console.log(`Brute-force found Part D URL: ${foundUrl}`);
                        }
                    } else if (target.type === 'medicare_snf_stats') {
                        const bruteResults = await bruteForceSNFUrls();
                        if (bruteResults.length > 0) {
                            foundUrl = bruteResults[0].url;
                            console.log(`Brute-force found SNF URL: ${foundUrl}`);
                        }
                    }
                }

                if (foundUrl) {
                    console.log(`Found URL for ${target.type}: ${foundUrl}`);

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

                    const failedBatches = await base44.asServiceRole.entities.ImportBatch.filter({
                        import_type: target.type,
                        status: 'failed'
                    });

                    const recentFailed = failedBatches.filter((b: any) => {
                        const created = new Date(b.created_date);
                        return (Date.now() - created.getTime()) < 48 * 60 * 60 * 1000;
                    });

                    for (const batch of recentFailed) {
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
                    results.push({ type: target.type, action: 'scan_failed', error: 'No ZIP link found in page or brute-force' });
                }

            } catch (err: any) {
                console.error(`Error processing ${target.type}:`, err);
                results.push({ type: target.type, action: 'error', error: err.message });
            }
        }

        return Response.json({ success: true, results });

    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
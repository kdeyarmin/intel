import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const payload = await req.json();
        const { id } = payload;
        if (!id) return Response.json({ error: 'Missing config ID' }, { status: 400 });

        let config;
        try {
            config = await base44.asServiceRole.entities.ImportScheduleConfig.get(id);
        } catch (e) {
            return Response.json({ error: 'Config not found' }, { status: 404 });
        }

        if (!config.api_url) {
            return Response.json({ error: 'No API URL defined' }, { status: 400 });
        }

        let isValid = false;
        let metadata = null;
        let summary = "URL validation failed";

        try {
            // Mimic browser to bypass basic WAF
            const head = await fetch(config.api_url, { 
                method: 'HEAD',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'application/zip, application/octet-stream, application/json, text/csv, */*'
                }
            });
            if (head.ok) {
                isValid = true;
                const size = head.headers.get('content-length');
                const lastModified = head.headers.get('last-modified');
                metadata = {
                    content_length: size ? parseInt(size, 10) : null,
                    last_modified: lastModified,
                    status: head.status
                };
                summary = `URL validated successfully.`;

                try {
                    const dataJsonResp = await fetch('https://data.cms.gov/data.json', {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                            'Accept': 'application/json'
                        }
                    });
                    if (dataJsonResp.ok) {
                        const dataJson = await dataJsonResp.json();
                        let foundDataset = null;
                        let foundDistribution = null;

                        if (dataJson && Array.isArray(dataJson.dataset)) {
                            for (const dataset of dataJson.dataset) {
                                if (Array.isArray(dataset.distribution)) {
                                    for (const dist of dataset.distribution) {
                                        if (dist.downloadURL === config.api_url || dist.accessURL === config.api_url) {
                                            foundDataset = dataset;
                                            foundDistribution = dist;
                                            break;
                                        }
                                    }
                                }
                                if (foundDataset) break;
                            }
                        }

                        if (foundDataset) {
                            metadata = {
                                ...metadata,
                                dataset_title: foundDataset.title,
                                dataset_description: foundDataset.description,
                                official_modified_date: foundDataset.modified || foundDistribution?.modified || lastModified,
                                publisher: foundDataset.publisher?.name,
                                format: foundDistribution?.format,
                            };
                            summary = `URL validated and enriched with CMS metadata.`;
                        }
                    }
                } catch (jsonErr) {
                    console.error("Failed to fetch or parse CMS data.json:", jsonErr);
                }
            } else {
                summary = `URL validation failed with status: ${head.status}`;
            }
        } catch (e) {
            summary = `URL validation error: ${e.message}`;
        }

        const updated = await base44.asServiceRole.entities.ImportScheduleConfig.update(id, {
            last_verified_at: new Date().toISOString(),
            last_run_summary: summary,
            cms_metadata: metadata || null
        });

        return Response.json({ success: true, config: updated, isValid });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
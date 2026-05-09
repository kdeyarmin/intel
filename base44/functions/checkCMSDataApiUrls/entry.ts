import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// #7 — Periodic health check for CMS data-api / DKAN URLs.
//
// triggerImport keeps a hardcoded IMPORT_TYPE_URLS map. This function probes every
// known URL (the hardcoded defaults + any per-schedule overrides) with a small
// $limit=1 / size=1 / limit=1 query and records the outcome on the matching
// ImportScheduleConfig so the admin UI can flag broken endpoints before the next
// scheduled run silently fails.

// Mirror the alias map from triggerImport so a schedule using `cms_utilization`
// (without an api_url override) still resolves to the canonical default URL.
const IMPORT_TYPE_ALIASES: Record<string, string> = {
    cms_utilization: 'provider_service_utilization',
};

const HARDCODED_URLS: Record<string, string> = {
    provider_service_utilization: 'https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-5d6207d46a29/data',
    cms_order_referring: 'https://data.cms.gov/data-api/v1/dataset/c99b5865-1119-4436-bb80-c5af2773ea1f/data',
    opt_out_physicians: 'https://data.cms.gov/data-api/v1/dataset/9887a515-7552-4693-bf58-735c77af46d7/data',
    home_health_enrollments: 'https://data.cms.gov/data-api/v1/dataset/15f64ab4-3172-4a27-b589-ebd67a6d28aa/data',
    hospice_enrollments: 'https://data.cms.gov/data-api/v1/dataset/25704213-e833-4b8b-9dbc-58dd17149209/data',
    medical_equipment_suppliers: 'https://data.cms.gov/provider-data/api/1/datastore/query/ct36-nrcq/0',
    hospice_provider_measures: 'https://data.cms.gov/provider-data/api/1/datastore/query/gxki-hrr8/0',
    hospice_state_measures: 'https://data.cms.gov/provider-data/api/1/datastore/query/eda0-92f0/0',
    hospice_national_measures: 'https://data.cms.gov/provider-data/api/1/datastore/query/7cv8-v37d/0',
    snf_provider_measures: 'https://data.cms.gov/provider-data/api/1/datastore/query/fykj-qjee/0',
    nursing_home_providers: 'https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0',
    nursing_home_deficiencies: 'https://data.cms.gov/provider-data/api/1/datastore/query/tbry-pc2d/0',
    home_health_national_measures: 'https://data.cms.gov/provider-data/api/1/datastore/query/97z8-de96/0',
};

const FETCH_TIMEOUT_MS = 10_000;

function probeQueryParam(url: string): string {
    if (url.includes('data-api/v1/dataset')) return 'size=1';
    if (url.includes('provider-data/api')) return 'limit=1';
    return '$limit=1';
}

async function probeUrl(url: string): Promise<{
    healthy: boolean;
    status?: number;
    error?: string;
    looks_like_html?: boolean;
    sample_count?: number;
}> {
    const probeUrl = url + (url.includes('?') ? '&' : '?') + probeQueryParam(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const resp = await fetch(probeUrl, { signal: controller.signal });
        if (!resp.ok) {
            return { healthy: false, status: resp.status, error: `HTTP ${resp.status} ${resp.statusText}` };
        }
        const text = await resp.text();
        const trimmed = text.trim().toLowerCase();
        // CMS likes to serve a holding page from the same origin when a dataset moves
        if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<head')) {
            return { healthy: false, status: resp.status, looks_like_html: true, error: 'Endpoint returned HTML, not data — URL likely deprecated' };
        }
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            return { healthy: false, status: resp.status, error: 'Response was not valid JSON' };
        }
        const arr = Array.isArray(parsed) ? parsed : (parsed?.results ?? parsed?.data ?? null);
        const count = Array.isArray(arr) ? arr.length : 0;
        if (count === 0) {
            // Empty arrays can mean the dataset still exists but has no rows — flag as a soft warning.
            return { healthy: false, status: resp.status, sample_count: 0, error: 'Endpoint returned 0 sample rows' };
        }
        return { healthy: true, status: resp.status, sample_count: count };
    } catch (e) {
        const msg = e?.name === 'AbortError' ? `Timed out after ${FETCH_TIMEOUT_MS}ms` : (e?.message || 'Unknown fetch error');
        return { healthy: false, error: msg };
    } finally {
        clearTimeout(timer);
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        let user = null;
        try { user = await base44.auth.me(); } catch (e) { /* service role */ }
        const isService = user && user.email && user.email.includes('service+');
        if (user && user.role !== 'admin' && !isService) {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Pull existing schedules so we can probe per-schedule api_url overrides too.
        const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({});
        const configByType = new Map<string, any>();
        for (const c of configs) {
            if (!configByType.has(c.import_type)) configByType.set(c.import_type, c);
        }

        const importTypes = new Set<string>([
            ...Object.keys(HARDCODED_URLS),
            ...configs.map(c => c.import_type).filter(t => t && !t.startsWith('medicare_') && t !== 'nppes_registry'),
        ]);

        const results = [];
        const checkedAt = new Date().toISOString();

        for (const importType of importTypes) {
            const config = configByType.get(importType);
            // Resolve aliases (e.g. cms_utilization → provider_service_utilization) so a
            // schedule using a legacy import_type without an api_url override still
            // probes the canonical hardcoded default.
            const resolvedType = IMPORT_TYPE_ALIASES[importType] || importType;
            const url = config?.api_url || HARDCODED_URLS[resolvedType] || HARDCODED_URLS[importType];
            if (!url) {
                results.push({ import_type: importType, healthy: false, error: 'No URL configured' });
                continue;
            }

            const probe = await probeUrl(url);
            results.push({ import_type: importType, url, ...probe });

            // Persist the result onto the matching schedule config (if any) so the
            // admin UI can render it without re-running the probe.
            if (config) {
                try {
                    await base44.asServiceRole.entities.ImportScheduleConfig.update(config.id, {
                        url_health: {
                            checked_at: checkedAt,
                            healthy: probe.healthy,
                            status: probe.status ?? null,
                            error: probe.error ?? null,
                            sample_count: probe.sample_count ?? null,
                            probed_url: url,
                        },
                    });
                } catch (e) {
                    console.warn(`[checkCMSDataApiUrls] Failed to persist health for ${importType}: ${e.message}`);
                }
            }
        }

        const broken = results.filter(r => !r.healthy);
        return Response.json({
            success: true,
            checked_at: checkedAt,
            total_checked: results.length,
            healthy: results.length - broken.length,
            broken: broken.length,
            results,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});

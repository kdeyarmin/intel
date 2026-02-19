import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const IMPORT_TYPE_URLS = {
  cms_utilization: 'https://data.cms.gov/data-api/v1/dataset/4c394e8d-c6b0-4e9f-8e98-3f85c1ea5d12/data',
  cms_order_referring: 'https://data.cms.gov/data-api/v1/dataset/26e73b72-9e86-4af7-bd35-dedb33f1e986/data',
  opt_out_physicians: 'https://data.cms.gov/data-api/v1/dataset/6bd6b1dd-208c-4f9c-88b8-b15fec6db548/data',
  provider_service_utilization: 'https://data.cms.gov/data-api/v1/dataset/e38967e5-4acc-4f3c-a0dd-8c0d038e2b51/data',
  home_health_enrollments: 'https://data.cms.gov/data-api/v1/dataset/8c52eb6b-1cce-4913-a16d-c2fa59c6ca67/data',
  hospice_enrollments: 'https://data.cms.gov/data-api/v1/dataset/41f3f9fb-1d06-4b69-b8e2-f3d8c3c9b6a1/data',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { import_type, file_url, dry_run = false, year } = body;

    if (!import_type) {
      return Response.json({ error: 'Missing required field: import_type' }, { status: 400 });
    }

    const validTypes = Object.keys(IMPORT_TYPE_URLS);
    if (!validTypes.includes(import_type)) {
      return Response.json({
        error: `Invalid import_type. Must be one of: ${validTypes.join(', ')}`,
      }, { status: 400 });
    }

    const resolvedUrl = file_url || IMPORT_TYPE_URLS[import_type];
    const resolvedYear = year || new Date().getFullYear();

    // Trigger the import via the existing autoImportCMSData function
    const response = await base44.asServiceRole.functions.invoke('autoImportCMSData', {
      import_type,
      file_url: resolvedUrl,
      year: resolvedYear,
      dry_run,
    });

    return Response.json({
      success: true,
      import_type,
      file_url: resolvedUrl,
      year: resolvedYear,
      dry_run,
      result: response.data,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
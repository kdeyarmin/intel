import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// CMS API "Dataset Type Identifiers" — these always resolve to the latest version
const IMPORT_TYPE_URLS = {
  cms_utilization: 'https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-96898b99ca61/data',
  cms_order_referring: 'https://data.cms.gov/data-api/v1/dataset/8ba0f9b4-9493-4aa0-9f82-44ea9468d1b5/data',
  opt_out_physicians: 'https://data.cms.gov/data-api/v1/dataset/9887a515-7552-4693-bf58-735c77af46d7/data',
  provider_service_utilization: 'https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-96898b99ca61/data',
  home_health_enrollments: 'https://data.cms.gov/data-api/v1/dataset/15f64ab4-3172-4a27-b589-ebd67a6d28aa/data',
  hospice_enrollments: 'https://data.cms.gov/data-api/v1/dataset/25704213-e833-4b8b-9dbc-58dd17149209/data',
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
    const response = await base44.functions.invoke('autoImportCMSData', {
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
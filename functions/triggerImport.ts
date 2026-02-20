import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// CMS Data API URLs - verified working endpoints
const IMPORT_TYPE_URLS = {
  // Provider & Service level utilization (Rndrng_NPI, HCPCS_Cd, Tot_Srvcs, etc.)
  provider_service_utilization: 'https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-5d6207d46a29/data',
  // Order and Referring (NPI, LAST_NAME, FIRST_NAME, PARTB, DME, HHA, PMD, HOSPICE)
  cms_order_referring: 'https://data.cms.gov/data-api/v1/dataset/c99b5865-1119-4436-bb80-c5af2773ea1f/data',
  // Opt-Out Physicians
  opt_out_physicians: 'https://data.cms.gov/data-api/v1/dataset/9887a515-7552-4693-bf58-735c77af46d7/data',
  // Home Health Enrollments
  home_health_enrollments: 'https://data.cms.gov/data-api/v1/dataset/15f64ab4-3172-4a27-b589-ebd67a6d28aa/data',
  // Hospice Enrollments
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

    // Check if it's a ZIP-based Medicare stats import
    const zipFunctionMap = {
      medicare_hha_stats: 'importMedicareHHA',
      medicare_ma_inpatient: 'importMedicareMAInpatient',
      medicare_part_d_stats: 'importMedicarePartD',
      medicare_snf_stats: 'importMedicareSNF',
    };

    if (zipFunctionMap[import_type]) {
      // Route to the specialized ZIP handler, passing through all params
      // Fire-and-forget: launch the ZIP-based import asynchronously
      // Use user-scoped invoke so admin auth passes through
      base44.functions.invoke(zipFunctionMap[import_type], {
        action: 'import',
        year: parseInt(year || new Date().getFullYear()),
        custom_url: file_url || undefined,
        dry_run,
        sheet_filter: body.sheet_filter || undefined,
        row_offset: body.row_offset || undefined,
        row_limit: body.row_limit || undefined,
      }).catch(err => {
        console.error(`[triggerImport] ${import_type} failed: ${err.message}`);
      });

      return Response.json({
        success: true,
        message: `Import started for ${import_type}. Check Import Monitoring for progress.`,
        import_type,
      });
    }

    // CMS API-based imports
    const validTypes = Object.keys(IMPORT_TYPE_URLS);
    if (!validTypes.includes(import_type)) {
      return Response.json({
        error: `Invalid import_type. Must be one of: ${[...validTypes, ...Object.keys(zipFunctionMap)].join(', ')}`,
      }, { status: 400 });
    }

    const resolvedUrl = file_url || IMPORT_TYPE_URLS[import_type];
    if (!resolvedUrl) {
      return Response.json({ error: 'No URL available for this import type. Please provide a file_url.' }, { status: 400 });
    }

    const resolvedYear = year || new Date().getFullYear();

    // Fire-and-forget: launch the import asynchronously so we don't time out
    // Use user-scoped client so admin auth passes through to sub-function
    base44.functions.invoke('autoImportCMSData', {
      import_type,
      file_url: resolvedUrl,
      year: resolvedYear,
      dry_run,
    }).catch(err => {
      console.error(`[triggerImport] autoImportCMSData failed: ${err.message}`);
    });

    return Response.json({
      success: true,
      message: `Import started for ${import_type}. Check Import Monitoring for progress.`,
      import_type,
      file_url: resolvedUrl,
      year: resolvedYear,
      dry_run,
    });
  } catch (error) {
    let errorData;
    try { errorData = error.response?.data; } catch (_) { errorData = null; }
    return Response.json({
      error: errorData?.error || error.message || 'Unknown error',
      error_phase: errorData?.error_phase || 'trigger',
      retryable: errorData?.retryable || false,
      batch_id: errorData?.batch_id,
      hint: errorData?.hint || 'Check backend logs or the Import Monitoring page for details.',
    }, { status: 500 });
  }
});
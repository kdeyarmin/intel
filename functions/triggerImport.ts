import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// CMS Data API URLs - verified working endpoints
// Aliases: cms_utilization maps to provider_service_utilization
const IMPORT_TYPE_ALIASES = {
  cms_utilization: 'provider_service_utilization',
};

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
    
    // Allow service role calls (from cancelStalledImports, runScheduledImports) or admin users
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      // Service role calls may not have a user context — that's OK
    }
    
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }
    const { import_type: raw_import_type, file_url, dry_run = false, year, retry_of, retry_count, retry_tags, category, resume_offset } = body;

    if (!raw_import_type) {
      return Response.json({ error: 'Missing required field: import_type' }, { status: 400 });
    }

    // Resolve aliases (e.g. cms_utilization -> provider_service_utilization)
    const import_type = IMPORT_TYPE_ALIASES[raw_import_type] || raw_import_type;

    // Check for duplicate imports already in progress
    // Filter out signal/control batches that aren't real imports
    const activeImports = await base44.asServiceRole.entities.ImportBatch.filter({
      import_type,
      status: { $in: ['validating', 'processing'] }
    });
    const realActive = activeImports.filter(b => {
      const fn = b.file_name || '';
      return fn !== 'batch_process_active' && fn !== 'crawler_batch_stop_signal' && fn !== 'crawler_auto_stop_signal';
    });

    if (realActive.length > 0) {
      const existing = realActive[0];
      // If the active batch has been stuck for over 2 hours, auto-cancel it
      const stuckMs = Date.now() - new Date(existing.updated_date || existing.created_date).getTime();
      if (stuckMs > 2 * 60 * 60 * 1000) {
        console.warn(`Auto-cancelling stale batch ${existing.id} (stuck ${Math.round(stuckMs / 60000)}min)`);
        await base44.asServiceRole.entities.ImportBatch.update(existing.id, {
          status: 'failed',
          cancel_reason: `Auto-cancelled: stuck in "${existing.status}" for ${Math.round(stuckMs / 60000)} minutes`,
          cancelled_at: new Date().toISOString(),
        });
      } else {
        return Response.json({
          error: `Import for ${import_type} is already in progress`,
          conflict: true,
          existing_batch_id: existing.id,
          started_at: existing.created_date,
        }, { status: 409 });
      }
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
      try {
        const res = await base44.asServiceRole.functions.invoke(zipFunctionMap[import_type], {
          action: 'import',
          year: parseInt(year || 2023),
          custom_url: file_url || undefined,
          dry_run,
          // Pass through retry/range params
          sheet_filter: body.sheet_filter || undefined,
          row_offset: body.row_offset || undefined,
          row_limit: body.row_limit || undefined,
          // Pass retry metadata so batch is tagged correctly
          retry_of: retry_of || undefined,
          retry_count: retry_count || undefined,
          retry_tags: retry_tags || undefined,
          category: category || undefined,
        });
        const result = res.data;
        // If the sub-function returned an error, surface it with details
        if (result?.error) {
          return Response.json({
            error: result.error,
            error_phase: result.error_phase || 'unknown',
            retryable: result.retryable || false,
            batch_id: result.batch_id,
            error_samples: result.error_samples,
            hint: result.hint || 'Check the batch error log for details.',
            import_type,
          }, { status: 500 });
        }
        return Response.json({ success: true, import_type, result });
      } catch (e) {
        // Extract useful info from the sub-function error
        let errorData;
        try { errorData = e.response?.data || JSON.parse(e.message); } catch (_) { errorData = null; }
        return Response.json({
          error: errorData?.error || e.message || 'Import function failed',
          error_phase: errorData?.error_phase || 'invocation',
          retryable: errorData?.retryable || false,
          batch_id: errorData?.batch_id,
          error_samples: errorData?.error_samples,
          hint: errorData?.hint || `The ${import_type} import function returned an error. Check backend logs for details.`,
          import_type,
        }, { status: 500 });
      }
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

    // Default to a safe year (2 years ago) for generic stats if not provided, otherwise pass through
    // Individual import functions (HHA, SNF, Part D) handle their own fallbacks to LATEST_AVAILABLE_YEAR
    const resolvedYear = year || (new Date().getFullYear() - 2);

    // Call autoImportCMSData via service role to avoid auth chain issues
    const response = await base44.asServiceRole.functions.invoke('autoImportCMSData', {
      import_type,
      file_url: resolvedUrl,
      year: resolvedYear,
      dry_run,
      resume_offset: resume_offset || body.row_offset || 0,
      // Pass retry metadata
      retry_of: retry_of || undefined,
      retry_count: retry_count || undefined,
      retry_tags: retry_tags || undefined,
      category: category || undefined,
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
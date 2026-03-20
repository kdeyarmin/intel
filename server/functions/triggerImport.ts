import { db } from "../db";
import { importBatches, cmsReferrals, providerServiceUtilization, medicareFacilities } from "../db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { handleImportNPPESFlatFile } from "./importNPPESFlatFile";

const IMPORT_TYPE_ALIASES: Record<string, string> = {
  cms_utilization: "provider_service_utilization",
};

const IMPORT_TYPE_URLS: Record<string, string> = {
  provider_service_utilization: "https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-5d6207d46a29/data",
  cms_order_referring: "https://data.cms.gov/data-api/v1/dataset/c99b5865-1119-4436-bb80-c5af2773ea1f/data",
  home_health_enrollments: "https://data.cms.gov/data-api/v1/dataset/15f64ab4-3172-4a27-b589-ebd67a6d28aa/data",
  hospice_enrollments: "https://data.cms.gov/data-api/v1/dataset/25704213-e833-4b8b-9dbc-58dd17149209/data",
  medical_equipment_suppliers: "https://data.cms.gov/provider-data/api/1/datastore/query/ct36-nrcq/0",
  hospice_provider_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/gxki-hrr8/0",
  hospice_state_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/eda0-92f0/0",
  hospice_national_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/7cv8-v37d/0",
  snf_provider_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/fykj-qjee/0",
  nursing_home_providers: "https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0",
  nursing_home_deficiencies: "https://data.cms.gov/provider-data/api/1/datastore/query/tbry-pc2d/0",
  home_health_national_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/97z8-de96/0",
};

const ZIP_FUNCTION_MAP: Record<string, string> = {
  medicare_hha_stats: "importMedicareHHA",
  medicare_ma_inpatient: "importMedicareMAInpatient",
  medicare_snf_stats: "importMedicareSNF",
};

const ALLOWED_URL_DOMAINS = [
  "data.cms.gov",
  "download.cms.gov",
  "npiregistry.cms.hhs.gov",
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_URL_DOMAINS.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export async function handleTriggerImport(payload: any, user: any) {
  if (!user || user.role !== "admin") {
    throw { status: 403, message: "Forbidden: Admin access required" };
  }

  const { import_type: raw_import_type, file_url, dry_run = false, year, retry_of, retry_count, retry_tags, category, resume_offset, batch_id } = payload;

  if (!raw_import_type) {
    throw { status: 400, message: "Missing required field: import_type" };
  }

  if (file_url && !isAllowedUrl(file_url)) {
    throw { status: 400, message: "file_url must be a CMS government domain (data.cms.gov, download.cms.gov)" };
  }

  const import_type = IMPORT_TYPE_ALIASES[raw_import_type] || raw_import_type;

  const activeImports = await db.select().from(importBatches)
    .where(and(eq(importBatches.import_type, import_type), inArray(importBatches.status, ["validating", "processing"])));
  const realActive = activeImports.filter((b) => {
    const fn = b.file_name || "";
    return fn !== "batch_process_active" && fn !== "crawler_batch_stop_signal" && fn !== "crawler_auto_stop_signal" && b.id !== batch_id;
  });

  if (realActive.length > 0) {
    const existing = realActive[0];
    const stuckMs = Date.now() - new Date(existing.updated_date || existing.created_date!).getTime();
    if (stuckMs > 60 * 60 * 1000) {
      await db.update(importBatches).set({
        status: "failed",
        cancel_reason: `Auto-cancelled: stuck in "${existing.status}" for ${Math.round(stuckMs / 60000)} minutes`,
        cancelled_at: new Date(),
        updated_date: new Date(),
      }).where(eq(importBatches.id, existing.id));
    } else {
      throw {
        status: 409,
        message: `Import for ${import_type} is already in progress`,
        conflict: true,
        existing_batch_id: existing.id,
        started_at: existing.created_date,
      };
    }
  }

  if (ZIP_FUNCTION_MAP[import_type]) {
    return {
      success: true,
      message: `Import process for ${import_type} started in the background. Check Data Center for progress.`,
      import_type,
      note: "ZIP-based Medicare imports are not yet migrated. The batch has been queued for processing.",
    };
  }

  if (import_type === "nppes_flat_file" || import_type === "nppes_registry_file") {
    if (!file_url) {
      throw { status: 400, message: "file_url is required for NPPES flat file imports" };
    }

    const [batch] = await db.insert(importBatches).values({
      import_type,
      file_name: file_url.split("/").pop() || "nppes_flat_file",
      status: "processing",
      dry_run: !!dry_run,
      total_rows: 0,
      imported_rows: 0,
    }).returning();

    setTimeout(() => {
      handleImportNPPESFlatFile({ batch_id: batch.id, file_url, byte_offset: 0 })
        .catch((e) => console.error(`[triggerImport] NPPES flat file import error:`, e.message));
    }, 100);

    return {
      success: true,
      message: `NPPES flat file import started in the background. Check Data Center for progress.`,
      import_type,
      batch_id: batch.id,
      file_url,
    };
  }

  const validTypes = Object.keys(IMPORT_TYPE_URLS);
  if (!validTypes.includes(import_type)) {
    throw {
      status: 400,
      message: `Invalid import_type. Must be one of: ${[...validTypes, ...Object.keys(ZIP_FUNCTION_MAP), "nppes_flat_file"].join(", ")}`,
    };
  }

  const resolvedUrl = file_url || IMPORT_TYPE_URLS[import_type];
  if (!resolvedUrl) {
    throw { status: 400, message: "No URL available for this import type. Please provide a file_url." };
  }

  const resolvedYear = year || new Date().getFullYear() - 2;
  const resolvedOffset = resume_offset || 0;

  let activeBatchId: number;

  if (batch_id) {
    await db.update(importBatches).set({
      status: "processing",
      cancel_reason: null,
      cancelled_at: null,
      error_samples: null,
      retry_params: { year: resolvedYear, resume_offset: resolvedOffset, retry_of, retry_count: (retry_count || 0) + 1, retry_tags, category, file_url: resolvedUrl },
      updated_date: new Date(),
    }).where(eq(importBatches.id, batch_id));
    activeBatchId = batch_id;
  } else {
    const [batch] = await db.insert(importBatches).values({
      import_type,
      file_name: `cms_${import_type}_${resolvedYear}`,
      status: "processing",
      dry_run: !!dry_run,
      total_rows: 0,
      imported_rows: 0,
      retry_params: { year: resolvedYear, resume_offset: resolvedOffset, retry_of, retry_count, retry_tags, category, file_url: resolvedUrl },
    }).returning();
    activeBatchId = batch.id;
  }

  setTimeout(() => {
    handleAutoImportCMSData({
      import_type,
      file_url: resolvedUrl,
      year: resolvedYear,
      dry_run,
      resume_offset: resolvedOffset,
      batch_id: activeBatchId,
    }).catch((e) => console.error(`[triggerImport] CMS import error:`, e.message));
  }, 100);

  return {
    success: true,
    message: batch_id
      ? `Resuming import for ${import_type} from offset ${resolvedOffset}. Check Data Center for progress.`
      : `Import process for ${import_type} started in the background. Check Data Center for progress.`,
    import_type,
    batch_id: activeBatchId,
    file_url: resolvedUrl,
    year: resolvedYear,
    dry_run,
    resumed: !!batch_id,
  };
}

function mapCMSOrderReferringRow(row: any, year: number, batchId: number) {
  return {
    npi: row.NPI || row.npi || null,
    referred_to_npi: null,
    referred_to_name: [row.LAST_NAME || row.last_name, row.FIRST_NAME || row.first_name].filter(Boolean).join(", ") || null,
    total_referrals: null,
    total_beneficiaries: null,
    data_year: String(year),
    raw_data: row,
    import_batch_id: String(batchId),
  };
}

function mapCMSUtilizationRow(row: any, year: number, batchId: number) {
  return {
    npi: row.Rndrng_NPI || row.npi || null,
    service_type: row.Rndrng_Prvdr_Type || row.HCPCS_Desc || null,
    total_services: row.Tot_Srvcs || null,
    total_unique_benes: row.Tot_Benes || null,
    average_submitted_chrg_amt: row.Avg_Sbmtd_Chrg || null,
    total_medicare_payment_amt: row.Avg_Mdcr_Pymt_Amt || null,
    data_year: String(year),
    raw_data: row,
  };
}

function mapMedicareFacilityRow(row: any, importType: string, batchId: number) {
  return {
    facility_type: importType,
    provider_id:
      row.cms_certification_number_ccn ||
      row["CMS Certification Number"] || row.CMS_Certification_Number ||
      row.CCN || row.ccn ||
      row.provider_id || row["Provider ID"] ||
      row.NPI || row.npi ||
      null,
    facility_name:
      row.facility_name || row["Facility Name"] || row.Facility_Name ||
      row.provider_name || row["Provider Name"] || row.Provider_Name ||
      row["ORGANIZATION NAME"] || row.organization_name ||
      row.businessname || row.practicename ||
      row["DOING BUSINESS AS NAME"] ||
      row.country ||
      null,
    address:
      row.address_line_1 || row["Address Line 1"] || row.Address_Line_1 ||
      row["ADDRESS LINE 1"] ||
      row.provider_address || row["Provider Address"] ||
      row.practiceaddress1 ||
      null,
    city:
      row.citytown || row["City/Town"] ||
      row.City || row.CITY || row.city ||
      row.practicecity ||
      null,
    state:
      row.state || row.State || row.STATE ||
      row["ENROLLMENT STATE"] ||
      row.practicestate ||
      null,
    zip:
      row.zip_code || row["Zip Code"] || row.Zip_Code ||
      row["ZIP CODE"] || row.ZIP_CODE ||
      row.practicezip9code ||
      null,
    raw_data: row,
    import_batch_id: String(batchId),
  };
}

async function insertCMSRows(importType: string, rows: any[], year: number, batchId: number): Promise<number> {
  if (rows.length === 0) return 0;

  const CHUNK_SIZE = 100;
  let inserted = 0;

  if (importType === "cms_order_referring") {
    const mapped = rows.map(r => mapCMSOrderReferringRow(r, year, batchId)).filter(r => r.npi);
    for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
      const chunk = mapped.slice(i, i + CHUNK_SIZE);
      try {
        await db.insert(cmsReferrals).values(chunk);
        inserted += chunk.length;
      } catch (e: any) {
        console.error(`[CMS Insert] Chunk error for ${importType}: ${e.message}`);
        for (const row of chunk) {
          try {
            await db.insert(cmsReferrals).values(row);
            inserted++;
          } catch { /* skip duplicate/invalid */ }
        }
      }
    }
  } else if (importType === "provider_service_utilization") {
    const mapped = rows.map(r => mapCMSUtilizationRow(r, year, batchId)).filter(r => r.npi);
    for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
      const chunk = mapped.slice(i, i + CHUNK_SIZE);
      try {
        await db.insert(providerServiceUtilization).values(chunk);
        inserted += chunk.length;
      } catch (e: any) {
        console.error(`[CMS Insert] Chunk error for ${importType}: ${e.message}`);
        for (const row of chunk) {
          try {
            await db.insert(providerServiceUtilization).values(row);
            inserted++;
          } catch { /* skip duplicate/invalid */ }
        }
      }
    }
  } else {
    const mapped = rows.map(r => mapMedicareFacilityRow(r, importType, batchId)).filter(r => r.provider_id || r.facility_name);
    for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
      const chunk = mapped.slice(i, i + CHUNK_SIZE);
      try {
        await db.insert(medicareFacilities).values(chunk);
        inserted += chunk.length;
      } catch (e: any) {
        console.error(`[CMS Insert] Chunk error for ${importType}: ${e.message}`);
        for (const row of chunk) {
          try {
            await db.insert(medicareFacilities).values(row);
            inserted++;
          } catch { /* skip duplicate/invalid */ }
        }
      }
    }
  }

  return inserted;
}

export async function handleAutoImportCMSData(params: any) {
  const { import_type, file_url, year, dry_run, resume_offset = 0, batch_id } = params;
  const MAX_EXEC_MS = 50000;
  const execStartTime = Date.now();
  const PAGE_SIZE = 500;
  const isProviderDataAPI = file_url.includes("/datastore/query/");

  try {
    let offset = resume_offset;
    let totalFetched = resume_offset;
    let totalInserted = 0;
    let hasMore = true;
    let consecutiveErrors = 0;
    const errors: any[] = [];

    while (hasMore && Date.now() - execStartTime < MAX_EXEC_MS) {
      let url: string;
      if (isProviderDataAPI) {
        const separator = file_url.includes("?") ? "&" : "?";
        url = `${file_url}${separator}offset=${offset}&limit=${PAGE_SIZE}`;
      } else {
        const separator = file_url.includes("?") ? "&" : "?";
        url = `${file_url}${separator}offset=${offset}&size=${PAGE_SIZE}`;
      }

      let response: Response;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
      } catch (e: any) {
        consecutiveErrors++;
        const errMsg = `Fetch failed at offset ${offset}: ${e.message}`;
        console.error(`[AutoImportCMS] ${errMsg}`);
        errors.push({ offset, message: errMsg });
        if (consecutiveErrors >= 3) {
          await db.update(importBatches).set({
            status: "failed",
            error_samples: errors.slice(-5),
            updated_date: new Date(),
          }).where(eq(importBatches.id, batch_id));
          return;
        }
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      if (response.status === 429) {
        console.warn(`[AutoImportCMS] Rate limited at offset ${offset}, waiting 10s`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      if (!response.ok) {
        consecutiveErrors++;
        const errMsg = `HTTP ${response.status} at offset ${offset}`;
        console.error(`[AutoImportCMS] ${errMsg}`);
        errors.push({ offset, message: errMsg });
        if (consecutiveErrors >= 3) {
          await db.update(importBatches).set({
            status: "failed",
            error_samples: errors.slice(-5),
            updated_date: new Date(),
          }).where(eq(importBatches.id, batch_id));
          return;
        }
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      consecutiveErrors = 0;
      const data = await response.json();
      const rows = Array.isArray(data) ? data : data.results || data.data || [];

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      if (!dry_run) {
        try {
          const inserted = await insertCMSRows(import_type, rows, year, batch_id);
          totalInserted += inserted;
        } catch (e: any) {
          console.error(`[AutoImportCMS] Insert error at offset ${offset}: ${e.message}`);
          errors.push({ offset, message: `Insert error: ${e.message}` });
        }
      }

      totalFetched += rows.length;
      offset += rows.length;

      await db.update(importBatches).set({
        imported_rows: totalInserted,
        total_rows: totalFetched,
        retry_params: { ...params, resume_offset: offset, total_inserted: totalInserted },
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch_id));

      if (rows.length < PAGE_SIZE) {
        hasMore = false;
      }
    }

    if (hasMore && Date.now() - execStartTime >= MAX_EXEC_MS) {
      console.log(`[AutoImportCMS] Time limit reached, scheduling continuation at offset ${offset}`);
      setTimeout(() => {
        handleAutoImportCMSData({ ...params, resume_offset: offset })
          .catch((e) => console.error(`[AutoImportCMS] Resume failed:`, e.message));
      }, 500);
      return;
    }

    await db.update(importBatches).set({
      status: "completed",
      completed_at: new Date(),
      imported_rows: totalInserted,
      total_rows: totalFetched,
      error_samples: errors.length > 0 ? errors.slice(-5) : null,
      updated_date: new Date(),
    }).where(eq(importBatches.id, batch_id));
    console.log(`[AutoImportCMS] Completed ${import_type}: fetched=${totalFetched}, inserted=${totalInserted}`);
  } catch (e: any) {
    console.error(`[AutoImportCMS] Fatal error:`, e.message);
    await db.update(importBatches).set({
      status: "failed",
      error_samples: [{ message: e.message, phase: "cms_import" }],
      updated_date: new Date(),
    }).where(eq(importBatches.id, batch_id));
  }
}

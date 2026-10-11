// What to do with an import batch that a server restart interrupted.
//
// Pure, so it can be tested without a database. server/index.ts runs the plan
// for every batch left "processing" or "validating". The batch's own
// retry_params carry everything the rest of the run needs: where it was, which
// year and release date its rows are stamped with, its row filters, and (for a
// headerless CSV) its column names. A plan that dropped any of those would
// import the remainder differently from the part already imported.

export interface InterruptedBatch {
  id: number;
  import_type: string | null;
  dry_run?: boolean | null;
  total_rows?: number | null;
  retry_params?: unknown;
}

export type RecoveryPlan =
  | { action: "cms"; params: Record<string, unknown> }
  | { action: "nppes_flat_file"; params: Record<string, unknown> }
  | { action: "nppes_file"; params: Record<string, unknown> }
  | { action: "fail"; reason: string };

/** The NPPES flat-file importer resumes itself from a byte offset; it is never read as a CMS CSV. */
export const NPPES_FLAT_FILE_TYPES: ReadonlySet<string> = new Set(["nppes_flat_file", "nppes_registry_file"]);
/** The NPPES V.2 dissemination zips (server/functions/importNPPESFile.ts) resume from a row offset, never as a CMS CSV. */
export const NPPES_ZIP_FILE_TYPES: ReadonlySet<string> = new Set(["nppes_weekly_incremental", "nppes_monthly_full"]);

export function planRecovery(batch: InterruptedBatch, now: Date = new Date()): RecoveryPlan {
  const rp = (batch.retry_params && typeof batch.retry_params === "object" ? batch.retry_params : {}) as Record<string, any>;
  const fileUrl = typeof rp.file_url === "string" && rp.file_url ? rp.file_url : null;
  if (!fileUrl) return { action: "fail", reason: "No file_url stored — cannot auto-resume" };

  if (NPPES_FLAT_FILE_TYPES.has(batch.import_type || "")) {
    return {
      action: "nppes_flat_file",
      params: {
        batch_id: batch.id,
        file_url: fileUrl,
        byte_offset: Number(rp.byte_offset) || 0,
        headers: Array.isArray(rp.headers) ? rp.headers : null,
        total_rows: Number(rp.total_rows) || 0,
      },
    };
  }

  if (NPPES_ZIP_FILE_TYPES.has(batch.import_type || "")) {
    return {
      action: "nppes_file",
      params: {
        batch_id: batch.id,
        file_url: fileUrl,
        import_type: batch.import_type,
        resume_offset: Number(rp.resume_offset) || Number(batch.total_rows) || 0,
        dry_run: !!batch.dry_run,
      },
    };
  }

  return {
    action: "cms",
    params: {
      import_type: batch.import_type,
      file_url: fileUrl,
      // The year the run was started with, not a constant: rows imported after
      // a restart must carry the same data_year as the rows before it.
      year: Number(rp.year) || now.getFullYear() - 2,
      batch_id: batch.id,
      dry_run: !!batch.dry_run,
      resume_offset: Number(rp.resume_offset) || Number(batch.total_rows) || 0,
      total_inserted: Number(rp.total_inserted) || 0,
      total_skipped: Number(rp.total_skipped) || 0,
      npi_filter: rp.npi_filter,
      state_filter: rp.state_filter,
      as_of: typeof rp.as_of === "string" ? rp.as_of : null,
      headers: Array.isArray(rp.headers) && rp.headers.length ? rp.headers.map(String) : undefined,
      license_type: typeof rp.license_type === "string" && rp.license_type ? rp.license_type : undefined,
    },
  };
}

// Pick the resume offset to display for a paused batch.
//
// Different importers persist the offset under different keys:
//   - resume_offset — generic, set by Medicare ZIP imports
//   - row_offset    — preferred when both row + byte offsets are stored
//                     (NPPES flat-file path persists both because Range resumes
//                     need bytes but progress is more meaningful in rows)
//   - byte_offset   — last-resort fallback for byte-range resumes
//
// Returns null fields when retry_params is missing/empty.
export function pickResumeOffset(retryParams) {
  if (!retryParams) return { resumeOffset: null, resumeIsByteOffset: false };
  if (retryParams.resume_offset != null) {
    return { resumeOffset: retryParams.resume_offset, resumeIsByteOffset: false };
  }
  if (retryParams.row_offset != null) {
    return { resumeOffset: retryParams.row_offset, resumeIsByteOffset: false };
  }
  if (retryParams.byte_offset != null) {
    return { resumeOffset: retryParams.byte_offset, resumeIsByteOffset: true };
  }
  return { resumeOffset: null, resumeIsByteOffset: false };
}

// Compute resume progress as a percentage of total rows. Only meaningful when
// the offset is row-based and total_rows is known and non-zero. Returns null
// otherwise — the UI hides the % suffix in that case.
export function resumeProgressPct(resumeOffset, resumeIsByteOffset, totalRows) {
  if (resumeIsByteOffset) return null;
  if (typeof resumeOffset !== 'number') return null;
  if (!totalRows || totalRows <= 0) return null;
  return Math.min(100, Math.round((resumeOffset / totalRows) * 100));
}

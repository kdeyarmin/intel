// The completeness / accuracy scores of a data quality scan, read from its
// stored results_summary (runDataQualityScan writes scores for completeness,
// accuracy, timeliness and consistency). Null when the scan has none.
export function qualityScoresFrom(summary: unknown): { completeness: number | null; accuracy: number | null } {
  const s = summary && typeof summary === "object" ? (summary as Record<string, unknown>) : null;
  const scores = s && typeof s.scores === "object" && s.scores ? (s.scores as Record<string, unknown>) : s;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : null);
  return {
    completeness: num(scores?.completeness ?? scores?.data_completeness ?? scores?.completeness_score),
    accuracy: num(scores?.accuracy ?? scores?.data_accuracy ?? scores?.accuracy_score),
  };
}

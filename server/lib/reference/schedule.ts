import { REFERENCE_DATASETS, fileForDataset, type Cadence, type ReferenceDataset } from "./catalog";

const CADENCE_MS: Record<Cadence, number> = {
  monthly: 32 * 24 * 60 * 60 * 1000,
  quarterly: 95 * 24 * 60 * 60 * 1000,
  yearly: 370 * 24 * 60 * 60 * 1000,
};

export type VersionSnapshot = {
  import_type: string;
  imported_at: string | Date | null;
  status?: string | null;
};

export type DueDataset = {
  id: string;
  due: boolean;
  reason: "never_imported" | "failed" | "stale" | "current";
  cadence: Cadence;
};

export function referenceDue(now: Date, versions: VersionSnapshot[], datasets: ReferenceDataset[] = REFERENCE_DATASETS): DueDataset[] {
  const byId = new Map(versions.map((row) => [row.import_type, row]));
  return datasets.map((dataset) => {
    const row = byId.get(dataset.id);
    if (!row?.imported_at) {
      return { id: dataset.id, due: true, reason: row?.status === "failed" ? "failed" : "never_imported", cadence: dataset.cadence };
    }
    if (row.status === "failed") return { id: dataset.id, due: true, reason: "failed", cadence: dataset.cadence };
    const imported = row.imported_at instanceof Date ? row.imported_at : new Date(row.imported_at);
    const stale = now.getTime() - imported.getTime() >= CADENCE_MS[dataset.cadence];
    return stale
      ? { id: dataset.id, due: true, reason: "stale", cadence: dataset.cadence }
      : { id: dataset.id, due: false, reason: "current", cadence: dataset.cadence };
  });
}

export type ReferencePlan = {
  mode: "dry-run" | "apply";
  due: DueDataset[];
  loads: string[];
};

/** Files are loaded only when apply is on and that dataset is due. */
export function referenceLoadPlan(args: {
  now: Date;
  versions: VersionSnapshot[];
  fileNames: string[];
  apply: boolean;
}): ReferencePlan {
  const due = referenceDue(args.now, args.versions);
  const loads = args.apply
    ? due.filter((item) => item.due && fileForDataset(item.id, args.fileNames)).map((item) => item.id)
    : [];
  return { mode: args.apply ? "apply" : "dry-run", due, loads };
}

export function freshnessStatus(item: DueDataset): "never_imported" | "failed" | "update_available" | "current" {
  if (!item.due) return "current";
  if (item.reason === "failed") return "failed";
  if (item.reason === "never_imported") return "never_imported";
  return "update_available";
}

export function referenceApplyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REFERENCE_LOAD_APPLY === "1" && Boolean(env.REFERENCE_DATA_DIR);
}

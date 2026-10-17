export type PosFacility = {
  ccn: string;
  period: string;
  name: string | null;
  state: string | null;
  category_code: string | null;
  control_type: string | null;
  certification_date: string | null;
  termination_date: string | null;
  chow_date: string | null;
};

export type PosSignal = {
  ccn: string;
  period: string;
  signal: "open" | "close" | "change_of_ownership";
  prior_period: string | null;
  detail: string;
};

function blank(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Competitor signals between two Provider of Services snapshots.
 * The first snapshot of a CCN produces no signals: every row would look like an opening.
 */
export function posSignals(previous: PosFacility[] | null | undefined, current: PosFacility[]): PosSignal[] {
  if (!previous?.length || !current.length) return [];
  const priorPeriod = previous[0]?.period ?? null;
  const period = current[0].period;
  const before = new Map(previous.map((row) => [row.ccn, row]));
  const after = new Map(current.map((row) => [row.ccn, row]));
  const signals: PosSignal[] = [];
  for (const row of current) {
    const old = before.get(row.ccn);
    if (!old) {
      signals.push({ ccn: row.ccn, period, signal: "open", prior_period: priorPeriod, detail: "CCN was not in the prior Provider of Services file" });
    }
    const chow = blank(row.chow_date);
    if (chow && chow !== blank(old?.chow_date)) {
      signals.push({ ccn: row.ccn, period, signal: "change_of_ownership", prior_period: priorPeriod, detail: `Change of ownership date ${chow}` });
    }
    const terminated = blank(row.termination_date);
    if (terminated && terminated !== blank(old?.termination_date)) {
      signals.push({ ccn: row.ccn, period, signal: "close", prior_period: priorPeriod, detail: `Termination date ${terminated}` });
    }
  }
  for (const row of previous) {
    if (!after.has(row.ccn)) {
      signals.push({ ccn: row.ccn, period, signal: "close", prior_period: priorPeriod, detail: "CCN dropped out of the Provider of Services file" });
    }
  }
  return signals;
}

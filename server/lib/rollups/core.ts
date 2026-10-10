// Pure building blocks for the background rollups.

/** "$1,234.56", "1234.56", " 12 " → number; anything else → null. Imports store money as text. */
export function parseMoney(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value).trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Same as parseMoney for counts stored as text. */
export const parseCount = parseMoney;

/** [lo, hi) primary-key ranges covering min..max. Gaps in ids just make some chunks small. */
export function planChunks(minId: number | null, maxId: number | null, size: number): Array<{ lo: number; hi: number }> {
  if (minId == null || maxId == null || maxId < minId) return [];
  const chunks = [];
  for (let lo = minId; lo <= maxId; lo += size) chunks.push({ lo, hi: Math.min(lo + size, maxId + 1) });
  return chunks;
}

/** NPIs as numbers keep the per-provider sets small. */
export const npiKey = (npi: unknown): number | null => {
  const s = String(npi ?? "");
  return /^\d{10}$/.test(s) ? Number(s) : null;
};

export interface Accumulator<Row, Out> {
  add(rows: Row[]): void;
  /** Moves the chunk's partial results to the staging store (after each chunk). */
  flush?(): Promise<void>;
  results(): Out[] | Promise<Out[]>;
  /** Rows that couldn't be used (e.g. unparseable money), for the run log. */
  skipped(): number;
}

/**
 * Where an accumulator keeps the parts that grow with the whole table (the
 * distinct providers per group, every referral target), so a job's memory is
 * bounded by one chunk. The runner uses session temp tables; tests use memory.
 */
export interface Staging {
  /** Adds (key, value) pairs; repeats are ignored. */
  addDistinct(pairs: Array<[string, number]>): Promise<void>;
  /** Distinct values per key. */
  distinctCounts(): Promise<Map<string, number>>;
  /** Adds to the running total and count of (key, id). */
  addSums(rows: Array<{ key: string; id: number; total: number; count: number }>): Promise<void>;
  /** Per key, the `keep` ids with the largest totals (ties: smaller id first). */
  topSums(keep: number): Promise<Array<{ key: string; id: number; total: number; count: number }>>;
}

export function memoryStaging(): Staging {
  const distinct = new Map<string, Set<number>>();
  const sums = new Map<string, Map<number, { total: number; count: number }>>();
  return {
    async addDistinct(pairs) {
      for (const [k, v] of pairs) {
        let set = distinct.get(k);
        if (!set) distinct.set(k, (set = new Set()));
        set.add(v);
      }
    },
    async distinctCounts() {
      return new Map([...distinct].map(([k, set]) => [k, set.size]));
    },
    async addSums(rows) {
      for (const r of rows) {
        let m = sums.get(r.key);
        if (!m) sums.set(r.key, (m = new Map()));
        const e = m.get(r.id) || { total: 0, count: 0 };
        e.total += r.total;
        e.count += r.count;
        m.set(r.id, e);
      }
    },
    async topSums(keep) {
      return [...sums].flatMap(([key, m]) =>
        [...m].sort((a, b) => b[1].total - a[1].total || a[0] - b[0]).slice(0, keep).map(([id, e]) => ({ key, id, ...e })));
    },
  };
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

/** Practice / all locations per 5-digit ZIP (territory density). */
export function zipLocationCounts(): Accumulator<{ zip: string | null; location_type: string | null }, { zip5: string; practice_locations: number; all_locations: number }> {
  const m = new Map<string, { practice: number; all: number }>();
  let skipped = 0;
  return {
    add(rows) {
      for (const r of rows) {
        const zip5 = String(r.zip || "").slice(0, 5);
        if (!/^\d{5}$/.test(zip5)) {
          skipped += 1;
          continue;
        }
        const e = m.get(zip5) || { practice: 0, all: 0 };
        e.all += 1;
        if (r.location_type === "Practice") e.practice += 1;
        m.set(zip5, e);
      }
    },
    results: () => [...m].map(([zip5, e]) => ({ zip5, practice_locations: e.practice, all_locations: e.all })).sort((a, b) => a.zip5.localeCompare(b.zip5)),
    skipped: () => skipped,
  };
}

interface PsuRow {
  npi: string | null;
  service_type: string | null;
  data_year: string | null;
  total_services: string | null;
  total_unique_benes: string | null;
  total_medicare_payment_amt: string | null;
  average_medicare_payment_amt: string | null;
}

/**
 * Medicare utilization by service type and data year: providers, services,
 * beneficiaries and payments (the payment total, or average × services when
 * only the average was imported).
 */
export function cmsServiceTypes(staging: Staging = memoryStaging()): Accumulator<PsuRow, { data_year: string; service_type: string; provider_count: number; total_services: number; total_payments: number; total_beneficiaries: number }> {
  const m = new Map<string, { year: string; type: string; services: number; payments: number; benes: number }>();
  // This chunk's (group, provider) pairs; the distinct count is kept in staging.
  let pairs = new Map<string, Set<number>>();
  let skipped = 0;
  return {
    add(rows) {
      for (const r of rows) {
        const type = (r.service_type || "").trim();
        const year = (r.data_year || "").trim();
        if (!type || !year) {
          skipped += 1;
          continue;
        }
        const key = `${year}|${type}`;
        let e = m.get(key);
        if (!e) {
          e = { year, type, services: 0, payments: 0, benes: 0 };
          m.set(key, e);
        }
        const npi = npiKey(r.npi);
        if (npi != null) {
          let set = pairs.get(key);
          if (!set) pairs.set(key, (set = new Set()));
          set.add(npi);
        }
        const services = parseCount(r.total_services) ?? 0;
        const total = parseMoney(r.total_medicare_payment_amt);
        const avg = parseMoney(r.average_medicare_payment_amt);
        const payment = total ?? (avg != null ? avg * services : null);
        if (payment == null && (r.total_medicare_payment_amt || r.average_medicare_payment_amt)) skipped += 1;
        e.services += services;
        e.payments += payment ?? 0;
        e.benes += parseCount(r.total_unique_benes) ?? 0;
      }
    },
    async flush() {
      const out: Array<[string, number]> = [];
      for (const [key, set] of pairs) for (const npi of set) out.push([key, npi]);
      pairs = new Map();
      if (out.length) await staging.addDistinct(out);
    },
    async results() {
      await this.flush!();
      const providers = await staging.distinctCounts();
      return [...m].map(([key, e]) => ({
        data_year: e.year,
        service_type: e.type.slice(0, 255),
        provider_count: providers.get(key) ?? 0,
        total_services: Math.round(e.services),
        total_payments: Math.round(e.payments * 100) / 100,
        total_beneficiaries: Math.round(e.benes),
      }));
    },
    skipped: () => skipped,
  };
}

/** The most-referred-to providers per data year (top `keep`), with how many providers refer to each. */
export function cmsTopReferred(keep = 500, staging: Staging = memoryStaging()): Accumulator<{ npi: string | null; referred_to_npi: string | null; total_referrals: unknown; data_year: string | null }, { data_year: string; referred_to_npi: string; total_referrals: number; referring_providers: number }> {
  // This chunk's partial sums per (year, target); the running totals for every
  // target live in staging, which picks the top ones at the end.
  let chunk = new Map<string, { key: string; id: number; total: number; count: number }>();
  let skipped = 0;
  return {
    add(rows) {
      for (const r of rows) {
        const to = npiKey(r.referred_to_npi);
        const year = (r.data_year || "").trim();
        if (to == null || !year) {
          skipped += 1;
          continue;
        }
        const k = `${year}|${to}`;
        const e = chunk.get(k) || { key: year, id: to, total: 0, count: 0 };
        e.total += parseCount(r.total_referrals) ?? 0;
        e.count += 1;
        chunk.set(k, e);
      }
    },
    async flush() {
      const rows = [...chunk.values()];
      chunk = new Map();
      if (rows.length) await staging.addSums(rows);
    },
    async results() {
      await this.flush!();
      return (await staging.topSums(keep)).map((e) => ({
        data_year: e.key,
        referred_to_npi: String(e.id).padStart(10, "0"),
        total_referrals: Math.round(e.total),
        referring_providers: e.count,
      }));
    },
    skipped: () => skipped,
  };
}

/** Records, states and latest data year per Medicare facility dataset. */
export function facilityTypes(): Accumulator<{ facility_type: string | null; state: string | null; data_year: string | null }, { facility_type: string; record_count: number; state_count: number; latest_year: string | null }> {
  const m = new Map<string, { count: number; states: Set<string>; year: string | null }>();
  let skipped = 0;
  return {
    add(rows) {
      for (const r of rows) {
        const type = (r.facility_type || "").trim();
        if (!type) {
          skipped += 1;
          continue;
        }
        const e = m.get(type) || { count: 0, states: new Set<string>(), year: null };
        e.count += 1;
        if (r.state) e.states.add(r.state.toUpperCase());
        if (r.data_year && (!e.year || r.data_year > e.year)) e.year = r.data_year;
        m.set(type, e);
      }
    },
    results: () => [...m].map(([facility_type, e]) => ({ facility_type, record_count: e.count, state_count: e.states.size, latest_year: e.year })),
    skipped: () => skipped,
  };
}

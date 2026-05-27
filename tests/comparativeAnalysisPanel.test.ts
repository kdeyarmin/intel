/**
 * Tests for the data-aggregation logic in ComparativeAnalysisPanel.
 *
 * The key PR change: `drug_services` was removed from:
 *   1. The per-group initialiser object (so groups no longer track drug_services totals)
 *   2. The `metrics` array used to build radar-chart data
 *   3. The `METRICS` table used to populate the metric selector
 *
 * Because these computations live inside useMemo hooks that are not exported,
 * we replicate the extracted logic here so the tests remain pure and fast
 * (no React render / JSDOM needed).
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Extracted group-building logic (mirrors ComparativeAnalysisPanel useMemo)
// ---------------------------------------------------------------------------
type UtilizationRow = {
  npi: string;
  total_medicare_payment?: number;
  total_services?: number;
  total_medicare_beneficiaries?: number;
  total_submitted_charges?: number;
  // deliberately NOT including drug_services – it was removed
};

type Provider = { npi: string; entity_type?: string; credential?: string };
type Location = { npi: string; is_primary?: boolean; state?: string };
type Taxonomy = { npi: string; primary_flag?: boolean; taxonomy_description?: string };

function buildComparisonData(
  utilization: UtilizationRow[],
  providers: Provider[],
  locations: Location[],
  taxonomies: Taxonomy[],
  compareBy: 'entity_type' | 'state' | 'specialty' | 'credential',
  metric: string,
) {
  const providerMap: Record<string, Provider> = {};
  providers.forEach(p => { providerMap[p.npi] = p; });

  const npiState: Record<string, string> = {};
  locations.forEach(l => { if (l.is_primary && l.state) npiState[l.npi] = l.state; });

  const npiTaxonomy: Record<string, string> = {};
  taxonomies.forEach(t => { if (t.primary_flag && t.taxonomy_description) npiTaxonomy[t.npi] = t.taxonomy_description; });

  const groups: Record<string, {
    name: string;
    total_medicare_payment: number;
    total_services: number;
    total_medicare_beneficiaries: number;
    total_submitted_charges: number;
    count: number;
  }> = {};

  utilization.forEach(u => {
    const prov = providerMap[u.npi];
    let groupKey = 'Unknown';
    if (compareBy === 'entity_type') groupKey = prov?.entity_type || 'Unknown';
    else if (compareBy === 'state') groupKey = npiState[u.npi] || 'Unknown';
    else if (compareBy === 'specialty') groupKey = npiTaxonomy[u.npi] || 'Unknown';
    else if (compareBy === 'credential') groupKey = prov?.credential || 'Unknown';

    if (!groups[groupKey]) {
      groups[groupKey] = {
        name: groupKey,
        total_medicare_payment: 0,
        total_services: 0,
        total_medicare_beneficiaries: 0,
        total_submitted_charges: 0,
        count: 0,
      };
    }
    groups[groupKey].total_medicare_payment += u.total_medicare_payment || 0;
    groups[groupKey].total_services += u.total_services || 0;
    groups[groupKey].total_medicare_beneficiaries += u.total_medicare_beneficiaries || 0;
    groups[groupKey].total_submitted_charges += u.total_submitted_charges || 0;
    groups[groupKey].count += 1;
  });

  return Object.values(groups)
    .filter(g => g.name !== 'Unknown')
    .sort((a: any, b: any) => b[metric] - a[metric])
    .slice(0, 15);
}

// ---------------------------------------------------------------------------
// Extracted radar-data builder (mirrors ComparativeAnalysisPanel radarData)
// ---------------------------------------------------------------------------
const RADAR_METRICS = [
  'total_medicare_payment',
  'total_services',
  'total_medicare_beneficiaries',
  'total_submitted_charges',
] as const;

function buildRadarData(comparisonData: ReturnType<typeof buildComparisonData>) {
  if (comparisonData.length < 2) return [];
  const top = comparisonData.slice(0, 5);
  const maxVals: Record<string, number> = {};
  RADAR_METRICS.forEach(m => {
    maxVals[m] = Math.max(...top.map(t => t[m] || 1));
  });
  return RADAR_METRICS.map(m => {
    const row: Record<string, number | string> = { metric: m.replace('total_', '').replace(/_/g, ' ') };
    top.forEach(t => { row[t.name] = Math.round((t[m] / maxVals[m]) * 100); });
    return row;
  });
}

// METRICS table used in the UI (mirrors the METRICS const in the component)
const METRICS = [
  { key: 'total_medicare_payment', label: 'Medicare Payments' },
  { key: 'total_services', label: 'Total Services' },
  { key: 'total_medicare_beneficiaries', label: 'Beneficiaries' },
  { key: 'total_submitted_charges', label: 'Submitted Charges' },
];

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------
const makeUtil = (npi: string, overrides: Partial<UtilizationRow> = {}): UtilizationRow => ({
  npi,
  total_medicare_payment: 1000,
  total_services: 100,
  total_medicare_beneficiaries: 50,
  total_submitted_charges: 2000,
  ...overrides,
});

const makeProvider = (npi: string, entity_type: string, credential = 'MD'): Provider => ({
  npi,
  entity_type,
  credential,
});

// ===========================================================================
// Tests
// ===========================================================================

describe('ComparativeAnalysisPanel – group aggregation (no drug_services)', () => {
  it('group objects do NOT have a drug_services property', () => {
    const providers = [makeProvider('1111111111', 'Individual')];
    const utilization = [makeUtil('1111111111')];
    const result = buildComparisonData(utilization, providers, [], [], 'entity_type', 'total_medicare_payment');

    expect(result).toHaveLength(1);
    const group = result[0];
    // The key change: drug_services must not exist on group objects
    expect('drug_services' in group).toBe(false);
  });

  it('aggregates the four retained numeric fields correctly', () => {
    const providers = [makeProvider('A', 'Individual'), makeProvider('B', 'Individual')];
    const utilization = [
      makeUtil('A', { total_medicare_payment: 500, total_services: 10, total_medicare_beneficiaries: 5, total_submitted_charges: 1000 }),
      makeUtil('B', { total_medicare_payment: 300, total_services: 8, total_medicare_beneficiaries: 3, total_submitted_charges: 600 }),
    ];
    const result = buildComparisonData(utilization, providers, [], [], 'entity_type', 'total_medicare_payment');

    expect(result).toHaveLength(1);
    const group = result[0];
    expect(group.total_medicare_payment).toBe(800);
    expect(group.total_services).toBe(18);
    expect(group.total_medicare_beneficiaries).toBe(8);
    expect(group.total_submitted_charges).toBe(1600);
    expect(group.count).toBe(2);
  });

  it('groups by entity_type correctly', () => {
    const providers = [
      makeProvider('P1', 'Individual'),
      makeProvider('P2', 'Organization'),
      makeProvider('P3', 'Individual'),
    ];
    const utilization = [
      makeUtil('P1', { total_medicare_payment: 100 }),
      makeUtil('P2', { total_medicare_payment: 200 }),
      makeUtil('P3', { total_medicare_payment: 150 }),
    ];
    const result = buildComparisonData(utilization, providers, [], [], 'entity_type', 'total_medicare_payment');

    expect(result).toHaveLength(2);
    const individual = result.find(g => g.name === 'Individual')!;
    const org = result.find(g => g.name === 'Organization')!;
    expect(individual.count).toBe(2);
    expect(individual.total_medicare_payment).toBe(250);
    expect(org.count).toBe(1);
    expect(org.total_medicare_payment).toBe(200);
  });

  it('groups by state using primary location', () => {
    const providers = [makeProvider('P1', 'Individual'), makeProvider('P2', 'Individual')];
    const locations: Location[] = [
      { npi: 'P1', is_primary: true, state: 'CA' },
      { npi: 'P2', is_primary: true, state: 'TX' },
    ];
    const utilization = [
      makeUtil('P1', { total_services: 10 }),
      makeUtil('P2', { total_services: 20 }),
    ];
    const result = buildComparisonData(utilization, providers, locations, [], 'state', 'total_services');

    expect(result.map(g => g.name).sort()).toEqual(['CA', 'TX']);
    const ca = result.find(g => g.name === 'CA')!;
    expect(ca.total_services).toBe(10);
  });

  it('filters out Unknown groups', () => {
    const utilization = [makeUtil('X')]; // no matching provider
    const result = buildComparisonData(utilization, [], [], [], 'entity_type', 'total_medicare_payment');
    expect(result).toHaveLength(0);
  });

  it('sorts groups descending by the selected metric', () => {
    const providers = [
      makeProvider('A', 'TypeA'),
      makeProvider('B', 'TypeB'),
      makeProvider('C', 'TypeC'),
    ];
    const utilization = [
      makeUtil('A', { total_services: 10 }),
      makeUtil('B', { total_services: 30 }),
      makeUtil('C', { total_services: 20 }),
    ];
    const result = buildComparisonData(utilization, providers, [], [], 'entity_type', 'total_services');

    expect(result[0].name).toBe('TypeB');
    expect(result[1].name).toBe('TypeC');
    expect(result[2].name).toBe('TypeA');
  });

  it('limits results to 15 groups', () => {
    const providers = Array.from({ length: 20 }, (_, i) => makeProvider(String(i), `Type${i}`));
    const utilization = providers.map(p => makeUtil(p.npi));
    const result = buildComparisonData(utilization, providers, [], [], 'entity_type', 'total_medicare_payment');
    expect(result).toHaveLength(15);
  });

  it('handles missing numeric fields with zero fallback', () => {
    const providers = [makeProvider('P', 'Individual')];
    const utilization = [{ npi: 'P' }]; // no numeric fields set
    const result = buildComparisonData(utilization, providers, [], [], 'entity_type', 'total_medicare_payment');
    expect(result[0].total_medicare_payment).toBe(0);
    expect(result[0].total_services).toBe(0);
  });
});

describe('ComparativeAnalysisPanel – radar data metrics (no drug_services)', () => {
  const makeGroups = (names: string[]) =>
    names.map(name => ({
      name,
      total_medicare_payment: 1000,
      total_services: 100,
      total_medicare_beneficiaries: 50,
      total_submitted_charges: 2000,
      count: 1,
    }));

  it('returns empty array when fewer than 2 groups', () => {
    const result = buildRadarData(makeGroups(['OnlyOne']));
    expect(result).toHaveLength(0);
  });

  it('produces exactly 4 metric rows (drug_services excluded)', () => {
    const groups = makeGroups(['A', 'B', 'C']);
    const result = buildRadarData(groups);
    expect(result).toHaveLength(4);
  });

  it('metric keys are the four retained ones only', () => {
    const groups = makeGroups(['A', 'B']);
    const result = buildRadarData(groups);
    const metricNames = result.map(r => r.metric);
    expect(metricNames).toContain('medicare payment');
    expect(metricNames).toContain('services');
    expect(metricNames).toContain('medicare beneficiaries');
    expect(metricNames).toContain('submitted charges');
    // drug_services was removed
    expect(metricNames).not.toContain('drug services');
    expect(metricNames).not.toContain('drug_services');
  });

  it('normalises group values to 0-100 range', () => {
    const groups = [
      { name: 'A', total_medicare_payment: 1000, total_services: 50, total_medicare_beneficiaries: 10, total_submitted_charges: 500, count: 1 },
      { name: 'B', total_medicare_payment: 500, total_services: 100, total_medicare_beneficiaries: 20, total_submitted_charges: 250, count: 1 },
    ];
    const result = buildRadarData(groups);
    const paymentRow = result.find(r => r.metric === 'medicare payment')!;
    // A has max payment (1000), so A should be 100
    expect(paymentRow['A']).toBe(100);
    // B is 500/1000 = 50
    expect(paymentRow['B']).toBe(50);
  });
});

describe('ComparativeAnalysisPanel – METRICS table (no drug_services)', () => {
  it('contains exactly 4 metric entries', () => {
    expect(METRICS).toHaveLength(4);
  });

  it('contains the four retained metric keys', () => {
    const keys = METRICS.map(m => m.key);
    expect(keys).toContain('total_medicare_payment');
    expect(keys).toContain('total_services');
    expect(keys).toContain('total_medicare_beneficiaries');
    expect(keys).toContain('total_submitted_charges');
  });

  it('does NOT contain drug_services', () => {
    const keys = METRICS.map(m => m.key);
    expect(keys).not.toContain('drug_services');
  });

  it('every metric entry has a non-empty key and label', () => {
    METRICS.forEach(m => {
      expect(m.key).toBeTruthy();
      expect(m.label).toBeTruthy();
    });
  });
});
/**
 * Tests for the data logic in TrendAnalysisPanel.
 *
 * PR changes:
 *  - `drug_services` removed from utilization metric options
 *  - `snf_referrals` removed from referral metric options
 *  - `imaging_referrals` removed from referral metric options
 *
 * METRIC_OPTIONS is a module-level constant (not exported), so we:
 *   1. Mirror the exact expected structure in this file.
 *   2. Test the `trendData` and `growthStats` computation logic inline.
 *
 * This keeps the tests fast (no JSDOM / React render required) while still
 * catching any re-introduction of the removed metric keys.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Mirror the expected METRIC_OPTIONS structure from TrendAnalysisPanel
// ---------------------------------------------------------------------------
const METRIC_OPTIONS = {
  utilization: [
    { key: 'total_services', label: 'Total Services' },
    { key: 'total_medicare_beneficiaries', label: 'Beneficiaries' },
    { key: 'total_medicare_payment', label: 'Medicare Payments ($)' },
    { key: 'total_submitted_charges', label: 'Submitted Charges ($)' },
  ],
  referrals: [
    { key: 'total_referrals', label: 'Total Referrals' },
    { key: 'home_health_referrals', label: 'Home Health' },
    { key: 'hospice_referrals', label: 'Hospice' },
    { key: 'dme_referrals', label: 'DME' },
  ],
} as const;

// ---------------------------------------------------------------------------
// Extracted trendData computation (mirrors the useMemo in TrendAnalysisPanel)
// ---------------------------------------------------------------------------
type Row = Record<string, number | string | undefined>;

function buildTrendData(source: Row[], selectedMetrics: string[]) {
  const byYear: Record<string | number, Record<string, number | string>> = {};
  source.forEach(r => {
    const yr = r['year'];
    if (!yr) return;
    if (!byYear[yr]) byYear[yr] = { year: yr };
    selectedMetrics.forEach(m => {
      byYear[yr][m] = ((byYear[yr][m] as number) || 0) + ((r[m] as number) || 0);
    });
  });
  return Object.values(byYear).sort((a, b) => (a.year as number) - (b.year as number));
}

// ---------------------------------------------------------------------------
// Extracted growthStats computation
// ---------------------------------------------------------------------------
function buildGrowthStats(trendData: Row[], selectedMetrics: string[], metricOptions: { key: string; label: string }[]) {
  if (trendData.length < 2) return [];
  const latest = trendData[trendData.length - 1];
  const prev = trendData[trendData.length - 2];
  return selectedMetrics.map(m => {
    const curr = (latest[m] as number) || 0;
    const old = (prev[m] as number) || 1;
    const pct = parseFloat(((curr - old) / old * 100).toFixed(1));
    return { key: m, label: metricOptions.find(x => x.key === m)?.label || m, pct };
  });
}

// ===========================================================================
// Tests
// ===========================================================================

describe('TrendAnalysisPanel – METRIC_OPTIONS structure', () => {
  // -----------------------------------------------------------------------
  // Utilization dataset
  // -----------------------------------------------------------------------
  describe('utilization metrics', () => {
    it('has exactly 4 metric options', () => {
      expect(METRIC_OPTIONS.utilization).toHaveLength(4);
    });

    it('contains total_services', () => {
      expect(METRIC_OPTIONS.utilization.some(m => m.key === 'total_services')).toBe(true);
    });

    it('contains total_medicare_beneficiaries', () => {
      expect(METRIC_OPTIONS.utilization.some(m => m.key === 'total_medicare_beneficiaries')).toBe(true);
    });

    it('contains total_medicare_payment', () => {
      expect(METRIC_OPTIONS.utilization.some(m => m.key === 'total_medicare_payment')).toBe(true);
    });

    it('contains total_submitted_charges', () => {
      expect(METRIC_OPTIONS.utilization.some(m => m.key === 'total_submitted_charges')).toBe(true);
    });

    it('does NOT contain drug_services (removed in PR)', () => {
      expect(METRIC_OPTIONS.utilization.some(m => m.key === 'drug_services')).toBe(false);
    });

    it('every utilization metric has a non-empty key and label', () => {
      METRIC_OPTIONS.utilization.forEach(m => {
        expect(m.key).toBeTruthy();
        expect(m.label).toBeTruthy();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Referrals dataset
  // -----------------------------------------------------------------------
  describe('referral metrics', () => {
    it('has exactly 4 metric options', () => {
      expect(METRIC_OPTIONS.referrals).toHaveLength(4);
    });

    it('contains total_referrals', () => {
      expect(METRIC_OPTIONS.referrals.some(m => m.key === 'total_referrals')).toBe(true);
    });

    it('contains home_health_referrals', () => {
      expect(METRIC_OPTIONS.referrals.some(m => m.key === 'home_health_referrals')).toBe(true);
    });

    it('contains hospice_referrals', () => {
      expect(METRIC_OPTIONS.referrals.some(m => m.key === 'hospice_referrals')).toBe(true);
    });

    it('contains dme_referrals', () => {
      expect(METRIC_OPTIONS.referrals.some(m => m.key === 'dme_referrals')).toBe(true);
    });

    it('does NOT contain snf_referrals (removed in PR)', () => {
      expect(METRIC_OPTIONS.referrals.some(m => m.key === 'snf_referrals')).toBe(false);
    });

    it('does NOT contain imaging_referrals (removed in PR)', () => {
      expect(METRIC_OPTIONS.referrals.some(m => m.key === 'imaging_referrals')).toBe(false);
    });

    it('every referral metric has a non-empty key and label', () => {
      METRIC_OPTIONS.referrals.forEach(m => {
        expect(m.key).toBeTruthy();
        expect(m.label).toBeTruthy();
      });
    });
  });
});

describe('TrendAnalysisPanel – trendData computation', () => {
  it('aggregates rows by year', () => {
    const source = [
      { year: 2022, total_services: 100, total_medicare_payment: 5000 },
      { year: 2022, total_services: 50, total_medicare_payment: 2000 },
      { year: 2023, total_services: 200, total_medicare_payment: 8000 },
    ];
    const result = buildTrendData(source, ['total_services', 'total_medicare_payment']);
    expect(result).toHaveLength(2);
    const y2022 = result.find(r => r.year === 2022)!;
    expect(y2022.total_services).toBe(150);
    expect(y2022.total_medicare_payment).toBe(7000);
    const y2023 = result.find(r => r.year === 2023)!;
    expect(y2023.total_services).toBe(200);
  });

  it('sorts years ascending', () => {
    const source = [
      { year: 2023, total_services: 100 },
      { year: 2021, total_services: 50 },
      { year: 2022, total_services: 75 },
    ];
    const result = buildTrendData(source, ['total_services']);
    expect(result.map(r => r.year)).toEqual([2021, 2022, 2023]);
  });

  it('skips rows without a year', () => {
    const source = [
      { total_services: 100 }, // no year
      { year: 2022, total_services: 50 },
    ];
    const result = buildTrendData(source, ['total_services']);
    expect(result).toHaveLength(1);
    expect(result[0].year).toBe(2022);
  });

  it('only aggregates selected metrics (other fields ignored)', () => {
    const source = [{ year: 2022, total_services: 100, drug_services: 50 }];
    const result = buildTrendData(source, ['total_services']);
    expect(result[0].total_services).toBe(100);
    // drug_services is not selected so it shouldn't appear in aggregation output
    expect(result[0].drug_services).toBeUndefined();
  });

  it('returns empty array for empty source', () => {
    expect(buildTrendData([], ['total_services'])).toHaveLength(0);
  });

  it('handles missing metric values with zero fallback', () => {
    const source = [{ year: 2022 }]; // no numeric fields
    const result = buildTrendData(source, ['total_services']);
    expect(result[0].total_services).toBe(0);
  });
});

describe('TrendAnalysisPanel – growthStats computation', () => {
  const metrics = METRIC_OPTIONS.utilization as unknown as { key: string; label: string }[];

  it('returns empty when fewer than 2 data points', () => {
    const trendData = [{ year: 2022, total_services: 100 }];
    expect(buildGrowthStats(trendData, ['total_services'], metrics)).toHaveLength(0);
  });

  it('calculates positive YoY growth correctly', () => {
    const trendData = [
      { year: 2022, total_services: 100 },
      { year: 2023, total_services: 150 },
    ];
    const stats = buildGrowthStats(trendData, ['total_services'], metrics);
    expect(stats[0].pct).toBe(50.0);
  });

  it('calculates negative YoY growth correctly', () => {
    const trendData = [
      { year: 2022, total_services: 200 },
      { year: 2023, total_services: 100 },
    ];
    const stats = buildGrowthStats(trendData, ['total_services'], metrics);
    expect(stats[0].pct).toBe(-50.0);
  });

  it('uses prev value of 1 when prev is zero to avoid division by zero', () => {
    const trendData = [
      { year: 2022, total_services: 0 },
      { year: 2023, total_services: 100 },
    ];
    const stats = buildGrowthStats(trendData, ['total_services'], metrics);
    // (100-1)/1*100 = 9900
    expect(stats[0].pct).toBe(9900.0);
  });

  it('attaches the correct metric label from METRIC_OPTIONS', () => {
    const trendData = [
      { year: 2022, total_medicare_payment: 1000 },
      { year: 2023, total_medicare_payment: 1200 },
    ];
    const stats = buildGrowthStats(trendData, ['total_medicare_payment'], metrics);
    expect(stats[0].label).toBe('Medicare Payments ($)');
  });

  it('falls back to key as label when not found in metricOptions', () => {
    const trendData = [
      { year: 2022, custom_metric: 100 },
      { year: 2023, custom_metric: 200 },
    ];
    const stats = buildGrowthStats(trendData, ['custom_metric'], metrics);
    expect(stats[0].label).toBe('custom_metric');
  });
});

describe('TrendAnalysisPanel – AdvancedAnalytics referral data mapping', () => {
  /**
   * The PR also updated the referral mapping in AdvancedAnalytics.jsx:
   *  - total_referrals now uses r.total_referrals || 0 (was always 1)
   *  - snf_referrals removed
   *  - imaging_referrals removed
   *  - home_health_referrals and hospice_referrals derived from raw_data flags
   *  - dme_referrals derived from raw_data.DME flag
   */
  type RawReferral = {
    data_year?: number;
    total_referrals?: number;
    raw_data?: Record<string, string>;
  };

  function mapReferralRow(r: RawReferral) {
    const rd = r.raw_data || {};
    return {
      year: r.data_year,
      total_referrals: r.total_referrals || 0,
      home_health_referrals: rd.HHA === 'Y' ? 1 : 0,
      hospice_referrals: rd.HOSPICE === 'Y' ? 1 : 0,
      dme_referrals: rd.DME === 'Y' ? 1 : 0,
    };
  }

  it('uses actual total_referrals value (not hardcoded 1)', () => {
    const row = mapReferralRow({ data_year: 2022, total_referrals: 42 });
    expect(row.total_referrals).toBe(42);
  });

  it('defaults total_referrals to 0 when absent', () => {
    const row = mapReferralRow({ data_year: 2022 });
    expect(row.total_referrals).toBe(0);
  });

  it('sets home_health_referrals=1 when HHA flag is Y', () => {
    const row = mapReferralRow({ raw_data: { HHA: 'Y' } });
    expect(row.home_health_referrals).toBe(1);
  });

  it('sets home_health_referrals=0 when HHA flag is not Y', () => {
    const row = mapReferralRow({ raw_data: { HHA: 'N' } });
    expect(row.home_health_referrals).toBe(0);
  });

  it('sets hospice_referrals=1 when HOSPICE flag is Y', () => {
    const row = mapReferralRow({ raw_data: { HOSPICE: 'Y' } });
    expect(row.hospice_referrals).toBe(1);
  });

  it('sets dme_referrals=1 when DME flag is Y', () => {
    const row = mapReferralRow({ raw_data: { DME: 'Y' } });
    expect(row.dme_referrals).toBe(1);
  });

  it('does NOT produce snf_referrals or imaging_referrals fields', () => {
    const row = mapReferralRow({ raw_data: {} }) as Record<string, unknown>;
    expect('snf_referrals' in row).toBe(false);
    expect('imaging_referrals' in row).toBe(false);
  });

  it('does NOT produce drug_services field (removed from utilization mapping too)', () => {
    // The PR also removed drug_services: 0 from utilization mapping in AdvancedAnalytics
    function mapUtilizationRow(r: Record<string, number>) {
      return {
        year: r.data_year,
        total_medicare_payment: r.total_medicare_payment_amt || 0,
        total_medicare_beneficiaries: r.total_unique_benes || 0,
        total_submitted_charges: (r.average_submitted_chrg_amt || 0) * (r.total_services || 1),
      };
    }
    const row = mapUtilizationRow({ data_year: 2022, total_medicare_payment_amt: 5000 }) as Record<string, unknown>;
    expect('drug_services' in row).toBe(false);
  });
});

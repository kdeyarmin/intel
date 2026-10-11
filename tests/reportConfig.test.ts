import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { DATASET_CONFIG, SCHEDULE_DATASETS } from '../src/components/customReports/reportConfig.jsx';
import { TEMPLATES } from '../src/components/scheduledReports/ReportTemplateLibrary.jsx';
import { REPORT_DATASETS, reportFields } from '../server/lib/reportAggregate';
import { tableMap } from '../server/db/schema';

// The report builder, the schedule form and the scheduled-report runner use
// one list of datasets. Every metric and group has to be a real column:
// anything else used to report zeros.
describe('report datasets', () => {
  it('the server runner mirrors the browser list exactly', () => {
    const strip = ({ entity, label, yearField, metrics, groupOptions, filters, countMetrics }: any) =>
      ({ entity, label, yearField, metrics, groupOptions, filters, countMetrics });
    expect(Object.keys(REPORT_DATASETS).sort()).toEqual(Object.keys(SCHEDULE_DATASETS).sort());
    for (const [key, ds] of Object.entries(SCHEDULE_DATASETS)) {
      expect(strip(REPORT_DATASETS[key]), key).toEqual(strip(ds));
    }
  });

  it.each(Object.entries(REPORT_DATASETS))('%s only names real columns', (_key, ds) => {
    const table = tableMap[ds.entity];
    expect(table, ds.entity).toBeTruthy();
    const columns = getTableColumns(table);
    for (const f of [...ds.metrics, ...ds.groupOptions].map((m) => m.key).concat(ds.yearField ? [ds.yearField] : [])) {
      expect(columns, `${ds.entity}.${f}`).toHaveProperty(f);
    }
    for (const c of ds.countMetrics || []) expect(ds.metrics.map((m) => m.key)).toContain(c);
  });

  it('the report builder offers the datasets that load in the browser', () => {
    expect(Object.keys(DATASET_CONFIG)).not.toContain('locations');
    expect(DATASET_CONFIG.outreach_metrics.entity).toBe('OutreachCampaign');
  });

  it.each(TEMPLATES.map((t: any) => [t.id, t]))('template %s uses fields its dataset has', (_id, t: any) => {
    expect(() => reportFields(REPORT_DATASETS[t.dataset], t)).not.toThrow();
  });
});

describe('reportFields', () => {
  const ds = REPORT_DATASETS.cms_referrals;

  it('lists the columns a schedule reads', () => {
    expect(reportFields(ds, { metrics: ['total_referrals'], group_by: 'data_year', filters: { year: 2024 } }))
      .toEqual(['total_referrals', 'data_year']);
  });

  it('rejects metrics, groups and filters the dataset does not have', () => {
    expect(() => reportFields(ds, { metrics: ['home_health_referrals'] })).toThrow(/no "Home Health Referrals" metric/);
    expect(() => reportFields(ds, { metrics: ['total_referrals'], group_by: 'year' })).toThrow(/can't be grouped by "Year"/);
    expect(() => reportFields(ds, { metrics: ['total_referrals'], filters: { hospital_type: 'acute' } })).toThrow(/can't be filtered/);
    expect(() => reportFields(ds, { metrics: [] })).toThrow(/at least one metric/);
  });
});

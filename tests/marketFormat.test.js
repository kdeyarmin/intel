import { describe, expect, it } from 'vitest';
import { csvHeader, csvValue, describeVintages, fmtCount, fmtMoney, fmtPct, fmtShare, formatMetric, ordinal, referralListNote, sortRows, toCsv } from '../src/lib/marketFormat.js';

describe('market formatting', () => {
  it('formats counts, fractions, percent units, money and rates, with a dash for nothing', () => {
    expect(fmtCount(310412.4)).toBe('310,412');
    expect(fmtShare(0.6213)).toBe('62%');
    expect(fmtShare(0.6213, 1)).toBe('62.1%');
    expect(fmtPct(11.05)).toBe('11.1%');
    expect(fmtMoney(21000)).toBe('$21K');
    expect(fmtMoney(2.5e6)).toBe('$2.5M');
    expect(fmtMoney(812)).toBe('$812');
    for (const v of [null, undefined, '', 'x']) expect(fmtCount(v)).toBe('—');
    expect(formatMetric(0.15, 'percent')).toBe('15.0%');
    expect(formatMetric(11.05, 'pct_units')).toBe('11.1%');
    expect(formatMetric(1234, 'money')).toBe('$1K');
    expect(formatMetric(321.46, 'rate')).toBe('321.5');
    expect(formatMetric(42, 'count')).toBe('42');
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 102, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '102nd', '111th']);
    expect(ordinal(null)).toBe('—');
  });

  it('builds a quoted CSV and sorts with nulls last', () => {
    const rows = [{ name: 'Allegheny County', benes: 310000 }, { name: 'Butler, "the" County', benes: null }, { name: 'Erie County', benes: 70000 }];
    expect(toCsv([{ key: 'name', label: 'county' }, { key: 'benes' }], rows)).toBe('county,benes\nAllegheny County,310000\n"Butler, ""the"" County",\nErie County,70000\n');
    expect(sortRows(rows, 'benes', 'asc').map((r) => r.name)).toEqual(['Erie County', 'Allegheny County', 'Butler, "the" County']);
    expect(sortRows(rows, 'name', 'desc').map((r) => r.name)).toEqual(['Erie County', 'Butler, "the" County', 'Allegheny County']);
  });

  it('describes the vintages a view used', () => {
    expect(describeVintages({ enrollment: '2026-06', saturation: '2025-01-01 to 2025-12-31', hospital_service_area: '2025', pac_utilization: null }))
      .toBe('Data: Medicare enrollment 2026-06; Market saturation 2025; Hospital Service Area 2025.');
    // A range that is not a calendar year keeps its start date.
    expect(describeVintages({ saturation: '2025-04-01 to 2026-03-31' })).toBe('Data: Market saturation 2025-04-01.');
    expect(describeVintages(null)).toBeNull();
    expect(describeVintages({})).toBeNull();
  });

  it('names each setting\'s own post-acute year when CMS released them in different years', () => {
    expect(describeVintages({ pac_utilization: '2025', pac_utilization_by_setting: { snf: '2025', hha: '2024', hospice: '2024' } }))
      .toBe('Data: Post-acute utilization skilled nursing 2025, home health 2024, hospice 2024.');
    expect(describeVintages({ pac_utilization: '2025', pac_utilization_by_setting: { snf: '2025', hha: '2025' } })).toBe('Data: Post-acute utilization 2025.');
    expect(describeVintages({ pac_utilization: '2024' })).toBe('Data: Post-acute utilization 2024.');
  });

  it('exports each county metric with one unit per column', () => {
    expect(csvHeader({ label: 'Medicare Advantage share', format: 'percent' })).toBe('Medicare Advantage share (%)');
    expect(csvHeader({ label: 'Home health use (% of FFS)', format: 'pct_units' })).toBe('Home health use (%)');
    expect(csvHeader({ label: 'SNF spend per beneficiary', format: 'money' })).toBe('SNF spend per beneficiary ($)');
    expect(csvHeader({ label: 'Medicare beneficiaries', format: 'count' })).toBe('Medicare beneficiaries');
    expect(csvValue(0.6234, 'percent')).toBe(62.34);
    expect(csvValue(11.05, 'pct_units')).toBe(11.05);
    expect(csvValue(null, 'percent')).toBe('');
    expect(csvValue('', 'count')).toBe('');
    expect(csvValue('310000', 'count')).toBe(310000);
  });
});

describe('referralListNote', () => {
  it('says nothing when the list is the whole ranked list', () => {
    expect(referralListNote({ rowCount: 25, truncated: false })).toBeNull();
    expect(referralListNote()).toBeNull();
  });

  it('says more are ranked below when an unfiltered list is cut off', () => {
    expect(referralListNote({ rowCount: 25, truncated: true })).toBe('More clinicians are ranked below these; raise the limit to see them.');
  });

  it('says how far a specialty search looked, so a short or empty list is not mistaken for all of them', () => {
    expect(referralListNote({ rowCount: 7, truncated: true, searched: 125, specialty: true }))
      .toBe('Searched the top 125 ranked clinicians for this specialty; raise the limit to search further.');
    expect(referralListNote({ rowCount: 0, truncated: true, searched: 1000, specialty: true }))
      .toBe('None of the top 1,000 ranked clinicians here are in this specialty. Raise the limit to search further.');
    expect(referralListNote({ rowCount: 7, truncated: false, searched: 60, specialty: true })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { BUSINESS_LINES, lineProfile } from '../src/lib/businessLine.js';
import { REPORT_CATALOG } from '../src/lib/marketBriefs.js';

describe('business line', () => {
  it('leaves every report visible until a line is chosen', () => {
    expect(lineProfile('all')).toBeNull();
    expect(lineProfile('nope')).toBeNull();
  });

  it('keeps each line on its own reports and facilities', () => {
    const hha = lineProfile('hha');
    expect(hha.reports).toEqual(['expand-hha', 'acquire-hha', 'hospital-partners', 'calls-hha']);
    expect(hha.reports.every((id) => REPORT_CATALOG.some((r) => r.id === id))).toBe(true);
    expect(hha.facilityTypes).toEqual(['home_health']);
    expect(hha.pacSettings).toEqual(['hha']);
    expect(lineProfile('pch').reports).toEqual([]);
    expect(lineProfile('pch').facilityTypes).toEqual(['licensed']);
    expect(lineProfile('pch').callSheetKinds).toEqual(['licensed']);
    expect(lineProfile('hospital').competitorSettings).toEqual(['hha', 'hospice', 'snf']);
    expect(lineProfile('snf').countyTabs).not.toContain('referrals');
    expect(BUSINESS_LINES.map((l) => l.id)).toContain('dme');
  });
});

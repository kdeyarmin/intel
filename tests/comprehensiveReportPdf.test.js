import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ doc: null, logo: vi.fn(async () => null), imageSize: null }));
vi.mock('@/components/exports/exportUtils', () => ({
  pdfLogo: state.logo,
  exportAttribution: () => 'Source: CareMetric analytics derived from public CMS files.',
}));
vi.mock('jspdf', async (original) => {
  const { jsPDF } = await original();
  return {
    jsPDF: function (options) {
      state.doc = new jsPDF(options);
      state.doc.save = vi.fn();
      if (state.imageSize) {
        state.doc.getImageProperties = vi.fn(() => state.imageSize);
        state.doc.addImage = vi.fn();
      }
      return state.doc;
    },
  };
});

import { downloadReportPdf } from '../src/components/reports/reportPdf';
import { buildReportModel } from '../src/components/reports/reportSections';

afterEach(() => {
  state.imageSize = null;
  state.logo.mockReset().mockResolvedValue(null);
});

describe('comprehensive report PDF', () => {
  it('fits a full wordmark without stretching it to a square', async () => {
    state.logo.mockResolvedValue('test-logo');
    state.imageSize = { width: 400, height: 100 };
    const model = buildReportModel({}, ['profile'], { providerId: '390111' });
    await downloadReportPdf(model);
    expect(state.doc.addImage).toHaveBeenCalledWith('test-logo', 'PNG', 14, 5, 40, 10);
  });

  it('generates a real paginated PDF with branding, curated sections and repeated headers', async () => {
    const report = {
      generatedAt: '2026-10-01T12:00:00Z',
      ownership: Array.from({ length: 30 }, (_, i) => ({
        dataset: 'hospital_all_owners', ownerName: `Example Holding Company ${i}`,
        percentage: 80, ownerType: 'Organization', role: 'Direct ownership interest', dataYear: '2024',
      })),
      costReports: [{ dataset: 'hospital_cost_report', metric: 'Total revenue', value: 1234567, format: 'money', dataYear: '2024' }],
      additionalQuality: [{ dataset: 'hospital_value_based_purchasing', metric: 'Total performance score', value: '45.6', dataYear: '2024' }],
    };
    const model = buildReportModel(report, ['ownership', 'costReports', 'additionalQuality'], { providerId: '390111', facilityName: 'Example Hospital' });
    await downloadReportPdf(model);
    const output = state.doc.output();
    expect(output).toMatch(/^%PDF-/);
    expect(state.doc.getNumberOfPages()).toBeGreaterThan(1);
    for (const text of ['CareMetric Intel', 'CareMetric Healthcare Advisors', 'https://caremetricintel.com/', 'Example Holding Company 29', '1,234,567', '45.6', 'Data Sources']) {
      expect(output).toContain(text);
    }
    expect(output.match(/CareMetric Intel/g)?.length).toBeGreaterThanOrEqual(state.doc.getNumberOfPages());
    expect(output).not.toMatch(/CareMetric AI|Healthcare Provider Intelligence|CareMetric\.ai/);
    expect(output.match(/\(Owner\)/g)?.length).toBeGreaterThan(1);
    expect(state.doc.save).toHaveBeenCalledWith('CareMetric-Intel-Example-Hospital-2026-10-01.pdf');
  });

  it('downloads a graceful empty-data report without a logo', async () => {
    const model = buildReportModel({}, ['costReports'], { providerId: '390111' });
    await downloadReportPdf(model);
    expect(state.doc.output()).toContain('No linked cost report metrics on file.');
    expect(state.doc.save).toHaveBeenCalledTimes(1);
  });

  it('prints identifier spellings and ungrouped years while grouping actual measurements', async () => {
    const model = buildReportModel({
      provider: { npi: '0123456789' },
      facility: { providerId: '001234', name: 'Example Hospital', latestYear: 2024 },
      locations: [{ city: 'Holtsville', state: 'NY', zip: '00501' }],
      utilization: [{ dataYear: 2024, totalServices: 1234567, totalPayment: 1234567 }],
      costReports: [{ metric: 'Associate ID', value: '0244144871' }, { metric: 'CCN', value: 'A71234' }],
    }, ['profile', 'locations', 'utilization', 'costReports'], { npi: '0123456789', providerId: '001234' });
    await downloadReportPdf(model);
    const output = state.doc.output();
    for (const value of ['0123456789', '001234', '00501', '0244144871', 'A71234', '2024', '1,234,567']) {
      expect(output).toContain(value);
    }
    expect(output).not.toMatch(/2,024|123,456,789|244,144,871/);
  });
});

import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ doc: null, logo: vi.fn(async () => null) }));
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
      return state.doc;
    },
  };
});

import { downloadReportPdf } from '../src/components/reports/reportPdf';
import { buildReportModel } from '../src/components/reports/reportSections';

describe('comprehensive report PDF', () => {
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
    for (const text of ['CareMetric AI', 'www.CareMetric.ai', 'Example Holding Company 29', '1,234,567', '45.6', 'Data Sources']) {
      expect(output).toContain(text);
    }
    expect(output.match(/CareMetric AI/g)?.length).toBeGreaterThanOrEqual(state.doc.getNumberOfPages());
    expect(output.match(/\(Owner\)/g)?.length).toBeGreaterThan(1);
    expect(state.doc.save).toHaveBeenCalledWith('CareMetric-Example-Hospital-2026-10-01.pdf');
  });

  it('downloads a graceful empty-data report without a logo', async () => {
    const model = buildReportModel({}, ['costReports'], { providerId: '390111' });
    await downloadReportPdf(model);
    expect(state.doc.output()).toContain('No linked cost report metrics on file.');
    expect(state.doc.save).toHaveBeenCalledTimes(1);
  });
});

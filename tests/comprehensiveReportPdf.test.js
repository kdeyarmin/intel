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
    for (const text of ['CareMetric Intel', 'caremetricintel.com', 'Example Holding Company 29', '1,234,567', '45.6', 'Data Sources']) {
      expect(output).toContain(text);
    }
    expect(output.match(/CareMetric Intel/g)?.length).toBeGreaterThanOrEqual(state.doc.getNumberOfPages());
    expect(output).not.toContain('CareMetric AI');
    expect(output).not.toContain('CareMetric.ai');
    expect(output.match(/\(Owner\)/g)?.length).toBeGreaterThan(1);
    expect(state.doc.save).toHaveBeenCalledWith('CareMetric-Example-Hospital-2026-10-01.pdf');
  });

  it('downloads a graceful empty-data report without a logo', async () => {
    const model = buildReportModel({}, ['costReports'], { providerId: '390111' });
    await downloadReportPdf(model);
    expect(state.doc.output()).toContain('No linked cost report metrics on file.');
    expect(state.doc.save).toHaveBeenCalledTimes(1);
  });

  it('renders missing-data coverage once after all populated sections', async () => {
    const model = buildReportModel({
      quality: [{ facilityType: 'snf', name: 'Example', qualityRating: 4, dataYear: 2024 }],
    }, ['quality', 'ownership', 'costReports'], { providerId: '010001' });
    await downloadReportPdf(model);
    expect(state.doc.output().match(/\(Data Availability\) Tj/g)).toHaveLength(1);
  });

  it('prints overview facts and preserves ungrouped years, ZIP codes and identifiers', async () => {
    const model = buildReportModel({
      facility: { name: 'Example Hospital', providerId: '010001', city: 'Boston', state: 'MA', zip: '02108', latestYear: 2024 },
      facilityUtilization: [{ dataset: 'hospital', dataYear: 2024, metric: 'Discharges', value: 1200, format: 'integer' }],
    }, ['profile', 'utilization'], { providerId: '010001' });
    await downloadReportPdf(model);
    const output = state.doc.output();
    for (const value of ['Executive Overview', '010001', '02108', '2024', '1,200', 'Facility Utilization']) expect(output).toContain(value);
    for (const value of ['2,024', '2,108', '10,001']) expect(output).not.toContain(value);
  });

  it('wraps long labels, values and table rows within the printable page area', async () => {
    const model = buildReportModel({
      facility: { name: 'Example Hospital', providerId: '010001', facilityTypes: Array(80).fill('home_health_agencies') },
      additionalQuality: [{ dataset: 'snf_quality_reporting', metric: `START ${'Long measure description '.repeat(350)} END`, value: 90, dataYear: 2024 }],
    }, ['profile', 'additionalQuality'], { providerId: '010001' });
    await downloadReportPdf(model);
    expect(state.doc.getNumberOfPages()).toBeGreaterThan(2);
    expect(state.doc.output()).toContain('END');
    const pageH = state.doc.internal.pageSize.getHeight();
    // PDF text baseline coordinates are points measured from the bottom.
    for (const page of state.doc.internal.pages.slice(1)) {
      for (const command of page) {
        const position = command.match(/[\d.]+ ([\d.]+) Td/);
        if (position) {
          const fromTop = pageH - Number(position[1]) / state.doc.internal.scaleFactor;
          expect(fromTop).toBeGreaterThanOrEqual(0);
          expect(fromTop).toBeLessThan(pageH - 4);
        }
      }
    }
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { formatExportValue, isIdentifierField } from '../src/components/exports/exportFormatting';
import { buildReportModel, fmtInt, fmtMoney } from '../src/components/reports/reportSections';
import { exportAttribution, exportCSV, exportExcel, exportJSON, exportPDF } from '../src/components/exports/exportUtils';
import ExportDialog from '../src/components/exports/ExportDialog';
import ReportDataTable from '../src/components/customReports/ReportDataTable';

const state = vi.hoisted(() => ({ doc: null, count: vi.fn(), error: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { billing: { countExport: state.count } } }));
vi.mock('sonner', () => ({ toast: { error: state.error } }));
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  state.doc = null;
  state.count.mockReset();
  state.error.mockReset();
});

const identifiers = [
  ['dataYear', 'Year', 2024, '2024'],
  ['zip', 'ZIP', '02108', '02108'],
  ['postal_code', 'Postal code', '02108-1234', '02108-1234'],
  ['npi', 'NPI', 1234567893, '1234567893'],
  ['providerId', 'CCN', '012345', '012345'],
  ['county_fips', 'County FIPS', '01001', '01001'],
  ['record_id', 'ID', '000123', '000123'],
  ['enrollment_id', 'Enrollment ID', '0000000123', '0000000123'],
  ['Provider Number', 'Provider Number', '012345', '012345'],
  ['ZIP Code', 'ZIP Code', '02108', '02108'],
  ['ZIP+4', 'ZIP+4', '02108-1234', '02108-1234'],
  ['fax', 'Fax', '0210812345', '0210812345'],
  ['fax', 'Fax', 2125551234, '2125551234'],
];

describe('report and export number formatting', () => {
  it.each(identifiers)('preserves %s without grouping or removing leading zeros', (key, label, input, output) => {
    expect(isIdentifierField({ key, label })).toBe(true);
    expect(formatExportValue(input, { key, label })).toBe(output);
  });

  it('groups quantities and currency, not identifier-like count fields', () => {
    expect(formatExportValue(12345, { key: 'totalServices' })).toBe('12,345');
    expect(formatExportValue(12345, { key: 'npi_count', label: 'NPI count' })).toBe('12,345');
    expect(formatExportValue(12345, { key: 'total_npies', label: 'NPI' })).toBe('12,345');
    expect(formatExportValue(12345, { key: 'number_of_provider_ids', label: 'Provider IDs' })).toBe('12,345');
    expect(isIdentifierField({ key: 'npi', label: 'Providers', format: 'count' })).toBe(false);
    expect(isIdentifierField({ key: 'id', label: 'Campaigns', format: 'number' })).toBe(false);
    expect(formatExportValue(12345, { key: 'npi', label: 'Providers', format: 'count' })).toBe('12,345');
    expect(formatExportValue(12345, { key: 'id', label: 'Campaigns', format: 'number' })).toBe('12,345');
    expect(formatExportValue(12345.67, { key: 'totalPayment' })).toBe('$12,345.67');
    expect(fmtInt(12345)).toBe('12,345');
    expect(fmtMoney(12345)).toBe('$12,345');
    expect(formatExportValue(null, { key: 'zip' })).toBe('');
    expect(formatExportValue('   ', { key: 'totalServices' })).toBe('');
    expect(formatExportValue('Not available', { key: 'totalServices' })).toBe('Not available');
  });

  it('keeps report identifiers, years and ZIPs literal while grouping totals', () => {
    const model = buildReportModel({
      provider: { npi: '1234567893' },
      facility: { providerId: '012345', latestYear: 2024 },
      locations: [{ city: 'Boston', state: 'MA', zip: '021081234' }],
      utilization: [{ dataYear: 2024, totalServices: 12345, totalPayment: 1234567 }],
      costReports: [
        { metric: 'Reporting year', value: 2024 },
        { metric: 'CCN', value: '012345' },
        { metric: 'Beds', value: 12345 },
      ],
    }, ['profile', 'locations', 'utilization', 'costReports'], { npi: '1234567893', providerId: '012345' });
    expect(model.profile.identifiers).toEqual(expect.arrayContaining([
      { label: 'CCN', value: '012345' },
      { label: 'Latest data year', value: '2024' },
      { label: 'Linked NPI', value: '1234567893' },
    ]));
    expect(model.sections[0].blocks[0].rows[0].place.text).toBe('Boston, MA, 02108');
    expect(model.sections[1].blocks[0].rows[0]).toMatchObject({
      year: { text: '2024' }, services: { text: '12,345' }, payment: { text: '$1,234,567' },
    });
    expect(model.sections[2].blocks[0].rows.map((row) => row.value.text)).toEqual(['2024', '012345', '12,345']);
  });

  it('brands a real generic PDF and formats identifier columns separately from quantities', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo unavailable'));
    const fields = identifiers.map(([key, label]) => ({ key, label }));
    fields.push({ key: 'totalServices', label: 'Services' }, { key: 'totalPayment', label: 'Payments' });
    const row = Object.fromEntries(identifiers.map(([key, , value]) => [key, value]));
    await exportPDF([{ ...row, totalServices: 12345, totalPayment: 1234567 }], fields, 'test', 'Provider report');
    const output = state.doc.output();
    for (const text of ['CareMetric Intel', 'CareMetric Healthcare Advisors', 'caremetricintel.com', 'https://caremetricintel.com/', '2024', '02108', '1234567893', '012345', '01001', '000123', '12,345', '1,234,567']) {
      expect(output).toContain(text);
    }
    expect(output).not.toContain('2,024');
    expect(output).not.toContain('1,234,567,893');
    expect(output).toContain('2125551234');
    expect(output).not.toContain('2,125,551,234');
    expect(state.doc.save).toHaveBeenCalledWith('test.pdf');
  });

  it('preserves raw CSV/JSON values and Excel text identifiers', async () => {
    const blobs = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { blobs.push(blob); return 'blob:export'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const fields = [{ key: 'zip', label: 'ZIP' }, { key: 'npi', label: 'NPI' }, { key: 'totalServices', label: 'Services' }];
    const rows = [{ zip: '02108', npi: '1234567893', totalServices: 12345 }];
    exportCSV(rows, fields, 'test');
    exportJSON(rows, fields, 'test');
    exportExcel(rows, fields, 'test');
    const contents = await Promise.all(blobs.map((blob) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    })));
    expect(contents[0]).toContain('02108,1234567893,12345');
    expect(JSON.parse(contents[1]).records).toEqual(rows);
    expect(contents[2]).toContain('mso-number-format:');
    expect(contents[2]).toContain('>02108</td>');
    expect(contents[2]).toContain('href="https://caremetricintel.com/"');
    expect(exportAttribution(new Date('2026-10-01T00:00:00Z'))).toContain('CareMetric Intel analytics by CareMetric Healthcare Advisors');
  });

  it('restores export controls after a download failure and keeps the dialog open', async () => {
    state.count.mockResolvedValue({ counted: true });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new Error('Download unavailable'); });
    render(<ExportDialog data={[{ zip: '02108' }]} fields={[{ key: 'zip', label: 'ZIP' }]} fileName="providers" title="Providers" />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Unable to export the selected records. Please try again.'));
    expect(screen.getByRole('button', { name: 'Export CSV' })).not.toBeDisabled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('exports explicit count and number fields as numeric Excel cells, not identifier text', async () => {
    let blob;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => { blob = value; return 'blob:export'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    exportExcel([{ npi: 12345, id: 23456, fax: '0210812345' }], [
      { key: 'npi', label: 'Providers', format: 'count' },
      { key: 'id', label: 'Campaigns', format: 'number' },
      { key: 'fax', label: 'Fax' },
    ], 'counts');
    const html = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(html).toContain('<td>12345</td><td>23456</td>');
    expect(html).toMatch(/<td style="mso-number-format:[^"]+">0210812345<\/td>/);
  });

  it.each([
    ['providers', 'npi', 'Providers'],
    ['hha_stats', 'npi', 'Agencies'],
    ['outreach_metrics', 'id', 'Campaigns'],
  ])('propagates %s count metadata from the report table while preserving the year grouping', async (dataset, metric, label) => {
    state.count.mockResolvedValue({ counted: true });
    let blob;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => { blob = value; return 'blob:export'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ReportDataTable
      chartData={[{ group: '2024', [metric]: 12345 }]}
      config={{ dataset, metrics: [metric], group_by: 'data_year', name: 'Annual report' }}
    />);
    expect(screen.getByRole('columnheader', { name: label })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(blob).toBeDefined());
    const html = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(html).toMatch(/<td style="mso-number-format:[^"]+">2024<\/td><td>12345<\/td>/);
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(state.doc.save).toHaveBeenCalledWith('Annual_report.pdf'));
    const output = state.doc.output();
    expect(output).toContain('12,345');
    expect(output).toContain('2024');
    expect(output).not.toContain('2,024');
  });
});

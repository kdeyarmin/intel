// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { api, pdf, quota } = vi.hoisted(() => ({
  api: { invoke: vi.fn() },
  pdf: { download: vi.fn(() => Promise.resolve()) },
  quota: { count: vi.fn(() => Promise.resolve({ ok: true })) },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: (...a) => api.invoke(...a) } } }));
vi.mock('@/components/exports/exportUtils', () => ({
  countExport: () => quota.count(),
  exportAttribution: () => 'Source: CareMetric analytics.',
}));
vi.mock('../src/components/reports/reportPdf', () => ({ downloadReportPdf: (m) => pdf.download(m) }));

import ComprehensiveReport from '../src/components/reports/ComprehensiveReport';
import ReportDocument from '../src/components/reports/ReportDocument';
import { availableSections, buildReportModel, REPORT_SECTIONS, reportFileName } from '../src/components/reports/reportSections';

afterEach(cleanup);
beforeEach(() => {
  api.invoke.mockReset();
  pdf.download.mockClear();
  quota.count.mockClear();
});

const REPORT = {
  generatedAt: '2026-10-01T12:00:00Z',
  provider: { npi: '1234567893', entityType: '1', displayName: 'Ada Lovelace', credential: 'MD', status: 'active' },
  summary: { totalPayments: 125000, totalServices: 900, totalBeneficiaries: 210, totalReferralsOut: 40, totalReferralsIn: 12, utilizationYears: ['2023'] },
  locations: [{ address_1: '1 Main St', city: 'Erie', state: 'PA', zip: '165011234', location_type: 'Practice' }],
  taxonomies: [{ taxonomy_code: '207R00000X', taxonomy_description: 'Internal Medicine', is_primary: true }],
  utilization: [],
  referralsFrom: [{ toNpi: '1111111112', toName: 'Erie Home Health', totalReferrals: 40, totalBeneficiaries: 30, dataYear: '2023' }],
  referralsTo: [],
  orderReferring: { partb: true, dme: 'Y', hha: false, pmd: null, hospice: 'N' },
  leadScore: null,
  quality: [{ facilityType: 'snf', name: 'Erie Manor', qualityRating: 4, dataYear: '2024' }],
  ownership: [{ dataset: 'snf_all_owners', ownerName: 'Example Holdings', percentage: 80, ownerType: 'Organization', role: 'Direct ownership', dataYear: '2024' }],
  costReports: [{ dataset: 'snf_cost_report', metric: 'Total revenue', value: 1234567, format: 'money', dataYear: '2024' }],
  additionalQuality: [{ dataset: 'snf_quality_reporting', metric: 'Discharge function score', value: '76.2', dataYear: '2024' }],
};

function wrap(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('report sections', () => {
  it('offers every section for an NPI and only facility sections for a CCN without one', () => {
    expect(availableSections({ npi: '1234567893' }).map((s) => s.key)).toEqual(REPORT_SECTIONS.map((s) => s.key));
    expect(availableSections({ providerId: '390111' }).map((s) => s.key)).toEqual(['profile', 'facilities', 'quality', 'ownership', 'costReports', 'additionalQuality']);
    expect(availableSections({})).toEqual([]);
  });

  it('builds only the chosen sections, in catalog order, with their sources', () => {
    const model = buildReportModel(REPORT, ['quality', 'referrals', 'profile'], { npi: '1234567893' });
    expect(model.title).toBe('Ada Lovelace');
    expect(model.subtitle).toBe('Provider Intelligence Report');
    expect(model.sections.map((s) => s.key)).toEqual(['referrals', 'quality']);
    expect(model.sections[0].blocks.map((b) => b.key)).toEqual(['referralsSent', 'referralsReceived', 'orderReferring']);
    expect(model.sections[0].blocks[2].items.map((i) => i.value)).toEqual(['Yes', 'Yes', 'No', '—', 'No']);
    expect(model.profile.metrics[0]).toMatchObject({ label: 'Medicare paid (2023)', value: '$125K' });
    expect(model.sources).toEqual([
      'NPPES National Provider Registry',
      'CMS physician shared-patient patterns; CMS Order and Referring file',
      'CMS Care Compare star ratings',
    ]);
    expect(model.attribution).toBe('Source: CareMetric analytics.');
  });

  it('reads an unscored provider as Unscored, never zero', () => {
    const model = buildReportModel(REPORT, ['leadScore'], { npi: '1234567893' });
    const block = model.sections[0].blocks[0];
    expect(block.items).toEqual([]);
    expect(block.emptyText).toMatch(/^Unscored/);
    const scored = buildReportModel({ ...REPORT, leadScore: { score: 71.6, outreach_potential: null } }, ['leadScore'], { npi: '1234567893' });
    expect(scored.sections[0].blocks[0].items[0]).toMatchObject({ label: 'Lead score', value: '72' });
  });

  it('uses the same curated data and sources in the print model, with missing values left blank', () => {
    const model = buildReportModel({ ...REPORT, ownership: [...REPORT.ownership, { ownerName: 'Other Owner', percentage: null }] },
      ['ownership', 'costReports', 'additionalQuality'], { providerId: '390111' });
    expect(model.sections.map((s) => s.key)).toEqual(['ownership', 'costReports', 'additionalQuality']);
    expect(model.sections[0].blocks[0].rows.map((r) => r.percentage.text)).toEqual(['80%', '—']);
    expect(model.sections[1].blocks[0].rows[0].value.text).toBe('$1,234,567');
    render(<ReportDocument model={model} />);
    for (const value of ['Example Holdings', '80%', '$1,234,567', 'Discharge function score', '76.2', 'www.CareMetric.ai']) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(model.sources).toHaveLength(3);
    const empty = buildReportModel({}, ['ownership', 'costReports', 'additionalQuality'], { providerId: '390111' });
    empty.sections.forEach((s) => expect(s.blocks[0].emptyText).toMatch(/No .*linked/));
  });

  it("titles a facility report with the facility, and shows no Medicare totals without an NPI", () => {
    const model = buildReportModel({ generatedAt: REPORT.generatedAt, facility: { providerId: '390111', name: 'Erie Manor', facilityTypes: ['snf'] }, summary: {} }, ['profile'], { providerId: '390111' });
    expect(model.title).toBe('Erie Manor');
    expect(model.subtitle).toBe('Facility Intelligence Report');
    expect(model.profile.metrics).toEqual([]);
    expect(model.profile.identifiers[0]).toEqual({ label: 'CCN', value: '390111' });
    expect(reportFileName(model)).toBe('CareMetric-Erie-Manor-2026-10-01');
  });
});

describe('ComprehensiveReport', () => {
  it('selects every section by default and asks only for the ones left checked', async () => {
    api.invoke.mockResolvedValue({ data: REPORT });
    wrap(<ComprehensiveReport npi="1234567893" />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(REPORT_SECTIONS.length);
    boxes.forEach((b) => expect(b).toHaveAttribute('aria-checked', 'true'));

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: /Generate Report \(0 sections\)/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Locations' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Quality measures' }));
    fireEvent.click(screen.getByRole('button', { name: /Generate Report \(2 sections\)/ }));

    await screen.findByRole('button', { name: /^Locations/ });
    expect(api.invoke).toHaveBeenCalledWith('getComprehensiveReport', { npi: '1234567893', provider_id: undefined, sections: ['locations', 'quality'] });
    expect(screen.getByText('1 Main St')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Quality Measures/ })).toBeInTheDocument();
    // Sections that weren't chosen stay out even when the payload has them.
    expect(screen.queryByRole('button', { name: /^Taxonomies/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('offers only facility sections for a facility without a linked NPI', () => {
    wrap(<ComprehensiveReport providerId="390111" facilityName="Erie Manor" />);
    expect(screen.getAllByRole('checkbox').map((b) => b.getAttribute('aria-labelledby') && document.getElementById(b.getAttribute('aria-labelledby')).textContent))
      .toEqual(['Profile & overview', 'Linked facilities', 'Quality measures', 'Ownership details', 'Cost report summaries', 'Additional quality measures']);
  });

  it('counts the export, then prints the branded document', async () => {
    api.invoke.mockResolvedValue({ data: REPORT });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      expect(document.body.classList.contains('cm-printing-report')).toBe(true);
      expect(document.querySelector('.cm-print-root .cm-report-doc')).not.toBeNull();
      expect(document.querySelector('.cm-print-root').textContent).toContain('CareMetric AI');
      expect(document.querySelector('.cm-print-root').textContent).toContain('Data Sources');
      expect(document.querySelector('.cm-print-root').textContent).toContain('Example Holdings');
      expect(document.querySelector('.cm-print-root').textContent).toContain('Discharge function score');
    });
    wrap(<ComprehensiveReport npi="1234567893" />);
    fireEvent.click(screen.getByRole('button', { name: /Generate Full Report/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Print/ }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(quota.count).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() => expect(document.querySelector('.cm-print-root')).toBeNull());
    expect(document.body.classList.contains('cm-printing-report')).toBe(false);
    print.mockRestore();
  });

  it('does not print or download past the export allowance', async () => {
    api.invoke.mockResolvedValue({ data: REPORT });
    quota.count.mockResolvedValueOnce({ ok: false, message: 'limit' }).mockResolvedValueOnce({ ok: false, message: 'limit' });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    wrap(<ComprehensiveReport npi="1234567893" />);
    fireEvent.click(screen.getByRole('button', { name: /Generate Full Report/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Print/ }));
    await waitFor(() => expect(quota.count).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    await waitFor(() => expect(quota.count).toHaveBeenCalledTimes(2));
    expect(print).not.toHaveBeenCalled();
    expect(pdf.download).not.toHaveBeenCalled();
    print.mockRestore();
  });

  it('downloads a PDF of the chosen sections', async () => {
    api.invoke.mockResolvedValue({ data: REPORT });
    wrap(<ComprehensiveReport npi="1234567893" />);
    fireEvent.click(screen.getByRole('button', { name: /Generate Full Report/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Download PDF/ }));
    await waitFor(() => expect(pdf.download).toHaveBeenCalledTimes(1));
    expect(pdf.download.mock.calls[0][0]).toMatchObject({ title: 'Ada Lovelace', selectedKeys: REPORT_SECTIONS.map((s) => s.key) });
    expect(pdf.download.mock.calls[0][0].sections.find((s) => s.key === 'costReports').blocks[0].rows[0].value.text).toBe('$1,234,567');
    expect(screen.getByText('Example Holdings')).toBeInTheDocument();
  });

  it('recovers print controls when export metering fails', async () => {
    api.invoke.mockResolvedValue({ data: REPORT });
    quota.count.mockRejectedValueOnce(new Error('network'));
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    wrap(<ComprehensiveReport npi="1234567893" />);
    fireEvent.click(screen.getByRole('button', { name: /Generate Full Report/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Print/ }));
    await waitFor(() => expect(quota.count).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /Print/ })).not.toBeDisabled());
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
  });
});

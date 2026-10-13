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
import { availableSections, buildReportModel, formatReportValue, REPORT_SECTIONS, reportFileName } from '../src/components/reports/reportSections';
import { CAREMETRIC_LOGO_URL } from '../src/lib/branding';
import ReportDataTable from '../src/components/customReports/ReportDataTable';

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
  return { client, ...render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  ) };
}

describe('report sections', () => {
  it.each([
    ['data_year', 2024, '2024'],
    ['dataYear', 2024, '2024'],
    ['zip', '00501', '00501'],
    ['ZIP Code', '00501-0012', '00501-0012'],
    ['associate_id', '0244144871', '0244144871'],
    ['associateId', 244144871, '244144871'],
    ['organization_npi', '0123456789', '0123456789'],
    ['NPI', 1234567893, '1234567893'],
    ['CCN', '001234', '001234'],
    ['provider_id', 'A71234', 'A71234'],
    ['Provider Number', '001234', '001234'],
    ['County FIPS', '01001', '01001'],
    ['enrollment_id', 'O20020812000015', 'O20020812000015'],
  ])('preserves %s without grouping or coercing its source value', (key, value, expected) => {
    expect(formatReportValue(value, { key })).toBe(expected);
    expect(formatReportValue(value, { label: key, format: 'count' })).toBe(expected);
  });

  it('formats true counts and currency normally without converting identifiers in model rows', () => {
    expect(formatReportValue(1234567, { key: 'beneficiaries', format: 'count' })).toBe('1,234,567');
    expect(formatReportValue('1234567', { label: 'Revenue', format: 'money' })).toBe('$1,234,567');
    const model = buildReportModel({
      provider: { npi: '0123456789' },
      facility: { providerId: '001234', latestYear: 2024 },
      locations: [{ city: 'Holtsville', state: 'NY', zip: '00501' }],
      utilization: [{ dataYear: 2024, totalServices: 12345, totalPayment: 1234567 }],
      referralsFrom: [{ toNpi: '0123456789', dataYear: 2024 }],
      affiliations: [{ organization_npi: '0123456789' }],
      costReports: [{ metric: 'Associate ID', value: '0244144871' }, { metric: 'CCN', value: 'A71234' }],
    }, ['profile', 'locations', 'utilization', 'referrals', 'affiliations', 'costReports'], { npi: '0123456789', providerId: '001234' });
    expect(model.profile.identifiers).toEqual(expect.arrayContaining([
      { label: 'CCN', value: '001234' }, { label: 'Linked NPI', value: '0123456789' }, { label: 'Latest data year', value: '2024' },
    ]));
    const rowsFor = (key) => model.sections.find((s) => s.key === key).blocks[0].rows;
    expect(rowsFor('locations')[0].place.text).toBe('Holtsville, NY, 00501');
    expect(rowsFor('utilization')[0]).toMatchObject({ year: { text: '2024' }, services: { text: '12,345' }, payment: { text: '$1,234,567' } });
    expect(rowsFor('referrals')[0].npi.text).toBe('0123456789');
    expect(rowsFor('affiliations')[0].npi.text).toBe('0123456789');
    expect(rowsFor('costReports').map((r) => r.value.text)).toEqual(['0244144871', 'A71234']);
  });

  it('brands the printed document with the canonical full logo and company website', () => {
    render(<ReportDocument model={buildReportModel(REPORT, ['profile'], { npi: '1234567893' })} />);
    expect(screen.getByRole('img', { name: 'CareMetric Healthcare Advisors' })).toHaveAttribute('src', CAREMETRIC_LOGO_URL);
    expect(screen.getByRole('link', { name: 'https://caremetricintel.com/' })).toHaveAttribute('href', 'https://caremetricintel.com/');
    expect(screen.getByText('CareMetric Intel')).toBeInTheDocument();
    expect(screen.getByText('CareMetric Healthcare Advisors')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/CareMetric AI|Healthcare Provider Intelligence|CareMetric\.ai/);
  });

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
    for (const value of ['Example Holdings', '80%', '$1,234,567', 'Discharge function score', '76.2', 'https://caremetricintel.com/']) {
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
    expect(reportFileName(model)).toBe('CareMetric-Intel-Erie-Manor-2026-10-01');
  });
});

describe('ComprehensiveReport', () => {
  it('brands the screen report consistently with the print document', async () => {
    api.invoke.mockResolvedValue({ data: REPORT });
    wrap(<ComprehensiveReport npi="1234567893" />);
    fireEvent.click(screen.getByRole('button', { name: /Generate Full Report/ }));
    await screen.findByRole('button', { name: /Download PDF/ });
    expect(screen.getByRole('img', { name: 'CareMetric Healthcare Advisors' })).toHaveAttribute('src', CAREMETRIC_LOGO_URL);
    expect(screen.getByRole('link', { name: 'https://caremetricintel.com/' })).toHaveAttribute('href', 'https://caremetricintel.com/');
    expect(screen.getByText('CareMetric Healthcare Advisors')).toBeInTheDocument();
    expect(document.body.textContent).toContain('CareMetric Intel');
    expect(document.body.textContent).not.toMatch(/CareMetric AI|Healthcare Provider Intelligence|CareMetric\.ai/);
  });

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

  describe('custom report identifiers and measurements', () => {
    it.each(['00501', '0123456789', '001234', 'A71234', 2024])('keeps group %s unchanged and counts distinct from money', (group) => {
      render(<ReportDataTable chartData={[{ group, total_services: 1234567, total_medicare_payment_amt: 1234567 }]}
        config={{ dataset: 'cms_utilization', group_by: 'npi', metrics: ['total_services', 'total_medicare_payment_amt'] }} />);
      expect(screen.getByRole('cell', { name: String(group) })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: '1,234,567' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: '$1,234,567' })).toBeInTheDocument();
    });

    it('formats an NPI aggregate as a count, not as an identifier or currency', () => {
      render(<ReportDataTable chartData={[{ group: 'PA', npi: 1234567 }]}
        config={{ dataset: 'hha_stats', group_by: 'state', metrics: ['npi'] }} />);
      expect(screen.getByRole('cell', { name: '1,234,567' })).toBeInTheDocument();
      expect(screen.queryByRole('cell', { name: /\$/ })).not.toBeInTheDocument();
    });

    it('retains fractional measurements without introducing currency for non-money metrics', () => {
      render(<ReportDataTable chartData={[{ group: '2024', total_services: 1234.5, total_medicare_payment_amt: 1234.5 }]}
        config={{ dataset: 'cms_utilization', group_by: 'data_year', metrics: ['total_services', 'total_medicare_payment_amt'] }} />);
      expect(screen.getByRole('cell', { name: '2024' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: '1,234.5' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: '$1,234.5' })).toBeInTheDocument();
    });
  });

  it('offers only facility sections for a facility without a linked NPI', () => {
    wrap(<ComprehensiveReport providerId="390111" facilityName="Erie Manor" />);
    expect(screen.getAllByRole('checkbox').map((b) => b.getAttribute('aria-labelledby') && document.getElementById(b.getAttribute('aria-labelledby')).textContent))
      .toEqual(['Profile & overview', 'Linked facilities', 'Quality measures', 'Ownership details', 'Cost report summaries', 'Additional quality measures']);
  });

  it.each([
    [{ npi: '1234567893' }, { npi: '1111111112' }],
    [{ providerId: '390111' }, { providerId: '390112' }],
  ])('clears the report when its subject changes from %j to %j', async (first, second) => {
    api.invoke.mockResolvedValue({ data: REPORT });
    const view = wrap(<ComprehensiveReport {...first} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate Full Report/ }));
    await screen.findByRole('button', { name: /Download PDF/ });
    view.rerender(
      <QueryClientProvider client={view.client}>
        <MemoryRouter><ComprehensiveReport {...second} /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: /Download PDF/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Full Report/ })).toBeInTheDocument();
    expect(api.invoke).toHaveBeenCalledTimes(1);
  });

  it('ignores an in-flight response for a previous subject', async () => {
    let resolve;
    api.invoke.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (npi) => <QueryClientProvider client={client}><MemoryRouter><ComprehensiveReport npi={npi} /></MemoryRouter></QueryClientProvider>;
    const view = render(ui('1234567893'));
    fireEvent.click(screen.getByRole('button', { name: /Generate Full Report/ }));
    await waitFor(() => expect(api.invoke).toHaveBeenCalledTimes(1));
    view.rerender(ui('1111111112'));
    resolve({ data: REPORT });
    await waitFor(() => expect(client.getQueryState(['comprehensiveReport', '1234567893', undefined, REPORT_SECTIONS.map((s) => s.key)])?.status).toBe('success'));
    expect(screen.queryByRole('button', { name: /Download PDF/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('counts the export, then prints the branded document', async () => {
    api.invoke.mockResolvedValue({ data: REPORT });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      expect(document.body.classList.contains('cm-printing-report')).toBe(true);
      expect(document.querySelector('.cm-print-root .cm-report-doc')).not.toBeNull();
      expect(document.querySelector('.cm-print-root').textContent).toContain('CareMetric Intel');
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

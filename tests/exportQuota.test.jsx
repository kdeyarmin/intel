// @vitest-environment jsdom
/**
 * Every CSV export counts against the organization's daily allowance before
 * the file is built, and ends with the source line (and, for the market table,
 * the data vintages it used). A day's limit used up stops the file, with the
 * server's message; any other failure to count doesn't block the export.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const h = vi.hoisted(() => {
  // Watch every host the code under test calls, from the moment its modules load.
  const fetchSpy = vi.fn(() => Promise.reject(new Error('offline')));
  globalThis.fetch = fetchSpy;
  return { countExport: vi.fn(), record: vi.fn(), toastError: vi.fn(), invoke: vi.fn(), list: vi.fn(), fetch: fetchSpy };
});
vi.mock('@/api/base44Client', () => {
  const entity = () => ({ list: (...a) => h.list(...a), filter: () => Promise.resolve([]), create: vi.fn(), update: vi.fn(), bulkCreate: vi.fn() });
  return {
    base44: {
      billing: { countExport: h.countExport },
      audit: { record: h.record },
      functions: { invoke: vi.fn(() => Promise.resolve({ data: {} })) },
      entities: { Provider: entity(), LeadScore: entity(), ProviderLocation: entity(), ProviderTaxonomy: entity(), ProviderServiceUtilization: entity(), LeadListMember: entity(), LeadList: entity() },
    },
  };
});
vi.mock('@/api/functionResult', () => ({ invokeOrThrow: (...a) => h.invoke(...a) }));
vi.mock('sonner', () => ({ toast: { error: h.toastError, success: vi.fn(), info: vi.fn() } }));
vi.mock('../src/components/compliance/DataSourcesFooter', () => ({ default: () => null }));
vi.mock('../src/components/leadlists/LeadListFilters', () => ({ default: () => <div data-testid="filters" /> }));
vi.mock('../src/components/leadlists/LeadResultsTable', () => ({ default: ({ results }) => <div data-testid="results">{results.length}</div> }));

import { countExport, exportAttribution, exportCSV, exportExcel, exportJSON } from '../src/components/exports/exportUtils';
import LeadListBuilder from '../src/pages/LeadListBuilder';
import LeadListStatusExport from '../src/components/leadlists/LeadListStatusExport';
import ReportDataTable from '../src/components/customReports/ReportDataTable';
import MarketIntelligence from '../src/pages/MarketIntelligence';

const fetchedOnImport = h.fetch.mock.calls.length;
const blobs = [];
const readBlob = (blob) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.readAsText(blob);
});

beforeEach(() => {
  for (const fn of [h.countExport, h.record, h.toastError, h.invoke, h.list]) fn.mockReset();
  h.fetch.mockClear();
  blobs.length = 0;
  URL.createObjectURL = vi.fn((blob) => { blobs.push(blob); return 'blob:test'; });
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

const quotaError = (message) => Object.assign(new Error(message), { status: 429 });

describe('countExport', () => {
  it('lets the export go ahead when the day still has room', async () => {
    h.countExport.mockResolvedValue({ ok: true });
    await expect(countExport()).resolves.toEqual({ ok: true });
  });

  it("stops it with the server's message when the day's limit is used up", async () => {
    h.countExport.mockRejectedValue(quotaError('Your organization has used its 50 exports for today.'));
    await expect(countExport()).resolves.toEqual({ ok: false, message: 'Your organization has used its 50 exports for today.' });
  });

  it("doesn't block an export because the count itself failed (offline, server error)", async () => {
    h.countExport.mockRejectedValue(Object.assign(new Error('Service unavailable'), { status: 503 }));
    await expect(countExport()).resolves.toEqual({ ok: true });
    h.countExport.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(countExport()).resolves.toEqual({ ok: true });
  });
});

describe('exportCSV', () => {
  it('ends with the data vintages the view used and the source line, each as one quoted cell', async () => {
    exportCSV([{ a: '1', b: 'x, y' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], 'file', { notes: ['Data: Medicare enrollment 2026-06.', null] });
    expect(blobs).toHaveLength(1);
    const text = (await readBlob(blobs[0])).replace(/^﻿/, '');
    const lines = text.split('\n');
    expect(lines[0]).toBe('A,B');
    expect(lines[1]).toBe('1,"x, y"');
    expect(lines[2]).toBe('Data: Medicare enrollment 2026-06.');
    // The attribution has commas, so it is quoted and stays one cell.
    expect(lines.at(-1)).toBe(`"${exportAttribution()}"`);
    expect(lines.at(-1)).toContain('not CMS publications');
    expect(lines.at(-1)).toContain('counts under 11 are suppressed');
  });
});

describe('the PDF logo', () => {
  it("isn't fetched when the module loads, or for exports that aren't PDFs", () => {
    // Importing exportUtils (and the pages that use it) must not call any host, nor may building CSV, Excel or JSON files.
    expect(fetchedOnImport).toBe(0);
    exportCSV([{ a: 1 }], [{ key: 'a', label: 'A' }], 'file');
    exportExcel([{ a: 1 }], [{ key: 'a', label: 'A' }], 'file');
    exportJSON([{ a: 1 }], [{ key: 'a', label: 'A' }], 'file');
    expect(h.fetch).not.toHaveBeenCalled();
  });
});

describe('every export format carries the source line', () => {
  const fields = [{ key: 'a', label: 'A' }];

  it('puts it in a JSON export beside the records, not in a bare array', async () => {
    exportJSON([{ a: 1, extra: 'dropped' }], fields, 'file');
    const parsed = JSON.parse(await readBlob(blobs[0]));
    expect(parsed).toEqual({ source: exportAttribution(), records: [{ a: 1 }] });
  });

  it('puts it in an Excel export as a last row', async () => {
    exportExcel([{ a: 1 }], fields, 'file');
    expect(await readBlob(blobs[0])).toContain(exportAttribution());
  });
});

function renderAt(path, Page, route) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={<Page />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Lead List Builder export', () => {
  beforeEach(() => {
    h.list.mockImplementation(() => Promise.resolve([]));
  });

  it('counts the export, then writes a file with the source line', async () => {
    h.countExport.mockResolvedValue({ ok: true });
    renderAt('/LeadListBuilder', LeadListBuilder, '/LeadListBuilder');
    fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(h.record).toHaveBeenCalledWith('export', expect.objectContaining({ action: 'csv_export', entity: 'lead_list' }));
    expect(h.countExport).toHaveBeenCalledTimes(1);
    const text = await readBlob(blobs[0]);
    expect(text).toContain('NPI,Name,Specialty,City,State,ZIP,Phone,Score,Patient Fingerprint');
    expect(text).toContain('not CMS publications');
  });

  it("builds no file once the day's export limit is used up, and says why", async () => {
    h.countExport.mockRejectedValue(quotaError("Today's export limit for your organization has been reached."));
    renderAt('/LeadListBuilder', LeadListBuilder, '/LeadListBuilder');
    fireEvent.click(await screen.findByRole('button', { name: /Export CSV/ }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Today's export limit for your organization has been reached."));
    expect(blobs).toHaveLength(0);
    // An export that didn't happen isn't logged as one.
    expect(h.record).not.toHaveBeenCalled();
  });
});

describe('Market Intelligence download', () => {
  const LAYER = {
    state: 'PA', all: true, vintages: { enrollment: '2026-06' }, rollups: {},
    counties: [
      { fips: '42003', name: 'Allegheny County', values: { benes: 310000, ma_penetration: 0.62 } },
      { fips: '42019', name: 'Butler County', values: { benes: 48000, ma_penetration: 0.55 } },
    ],
  };

  it('counts the download, then ends the file with the data vintages and the source line', async () => {
    h.invoke.mockResolvedValue(LAYER);
    h.countExport.mockResolvedValue({ ok: true });
    renderAt('/MarketIntelligence', MarketIntelligence, '/MarketIntelligence');
    await screen.findAllByRole('row');
    fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(h.countExport).toHaveBeenCalledTimes(1);
    const text = await readBlob(blobs[0]);
    expect(text).toContain('Allegheny County');
    expect(text).toContain('Data: Medicare enrollment 2026-06.');
    expect(text).toContain('not CMS publications');
  });

  it("doesn't build the file when the day's export limit is used up", async () => {
    h.invoke.mockResolvedValue(LAYER);
    h.countExport.mockRejectedValue(quotaError('You have used all 50 exports for today.'));
    renderAt('/MarketIntelligence', MarketIntelligence, '/MarketIntelligence');
    await screen.findAllByRole('row');
    fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('You have used all 50 exports for today.'));
    expect(blobs).toHaveLength(0);
  });
});

describe('the other export buttons', () => {
  const leads = [{ member: { npi: '1234567893', status: 'New' }, provider: { entity_type: 'Individual', first_name: 'Ann', last_name: 'Lee' }, taxonomy: null, location: null, score: null, utilization: null, referrals: null }];
  const config = { dataset: 'providers', name: 'My report', metrics: ['count'], group_by: 'state' };
  const chartData = [{ group: 'PA', count: 12 }];

  it('count a lead list export, and build the file only when the day has room', async () => {
    h.countExport.mockResolvedValue({ ok: true });
    render(<LeadListStatusExport leads={leads} listName="PA cardiology" />);
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(h.countExport).toHaveBeenCalledTimes(1);
    expect(await readBlob(blobs[0])).toContain('not CMS publications');
    cleanup();

    blobs.length = 0;
    h.countExport.mockRejectedValue(quotaError('You have used all 50 exports for today.'));
    render(<LeadListStatusExport leads={leads} listName="PA cardiology" />);
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('You have used all 50 exports for today.'));
    expect(blobs).toHaveLength(0);
  });

  it('count a custom report export, and build nothing once the limit is used up', async () => {
    h.countExport.mockResolvedValue({ ok: true });
    render(<ReportDataTable chartData={chartData} config={config} />);
    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(h.countExport).toHaveBeenCalledTimes(1);
    cleanup();

    blobs.length = 0;
    h.countExport.mockRejectedValue(quotaError("Today's export limit for your organization has been reached."));
    render(<ReportDataTable chartData={chartData} config={config} />);
    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Today's export limit for your organization has been reached."));
    expect(blobs).toHaveLength(0);
  });
});

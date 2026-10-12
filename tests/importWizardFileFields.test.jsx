// @vitest-environment jsdom
/**
 * The Data Center wizard imports a file: for a dataset read from an admin's file the server refuses the import without
 * the data year, and a state licensing export takes the state and license type when the file lacks such columns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const h = vi.hoisted(() => ({ created: [], triggers: [], triggerError: null }));

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: { ImportBatch: { create: async (row) => { h.created.push(row); return { id: 41, ...row }; }, subscribe: () => () => {} } },
    functions: {
      invoke: async (name, payload) => {
        h.triggers.push({ name, payload });
        if (h.triggerError) throw new Error(h.triggerError);
        return { data: { success: true } };
      },
    },
    audit: { record: async () => {} },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The file step: one click parses a pretend CSV.
vi.mock('../src/components/imports/FileParser', () => ({
  default: ({ onParsed }) => (
    <button type="button" onClick={() => onParsed({ headers: ['name', 'city'], file: { name: 'pch.csv' }, file_url: '/api/storage/pch.csv' })}>Parse the file</button>
  ),
}));
vi.mock('../src/components/imports/ColumnMapper', () => ({ default: () => null }));
vi.mock('../src/components/imports/AIBatchCategorizer', () => ({ default: () => null }));
vi.mock('../src/components/imports/AICleaningSuggestions', () => ({ default: () => null }));
vi.mock('../src/components/imports/NPPESFlatFileHelper', () => ({ default: () => null }));
vi.mock('../src/components/imports/columnMappingAI', () => ({
  generateAIMapping: async (_headers, required) => ({ mapping: Object.fromEntries(required.map((c) => [c, 'name'])), confidence: {}, scores: {}, optionalColumns: [] }),
  saveLearnedMapping: vi.fn(),
  OPTIONAL_COLUMNS: {},
}));

import ImportWizardAccordion from '../src/components/imports/ImportWizardAccordion';

const LICENSED = { id: 'licensed_facilities', name: 'State-Licensed Homes', requiredColumns: ['name'] };
const OTHER = { id: 'nursing_home_chains', name: 'NH Chain Data', requiredColumns: ['Chain'] };
const THIS_YEAR = new Date().getFullYear();

function wizard(type) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ImportWizardAccordion selectedType={type} onReset={() => {}} /></QueryClientProvider>);
}

async function readyToImport() {
  fireEvent.click(screen.getByRole('button', { name: 'Parse the file' }));
  // Mapping completes on its own; the last step is opened from its header.
  const step = await screen.findByRole('button', { name: /Validate & Import/ });
  await waitFor(() => expect(step).toBeEnabled());
  fireEvent.click(step);
  return screen.findByRole('button', { name: /Import Data/ });
}

beforeEach(() => {
  h.created.length = 0;
  h.triggers.length = 0;
  h.triggerError = null;
  // jsdom has no pointer capture or scrolling, which Radix's select uses when it opens.
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

describe('a state licensing export in the Data Center wizard', () => {
  it('sends the data year with the file (the server refuses the import without it)', async () => {
    wizard(LICENSED);
    const button = await readyToImport();
    expect(screen.getByLabelText('Data year')).toHaveValue(String(THIS_YEAR));
    fireEvent.change(screen.getByLabelText('Data year'), { target: { value: '2026' } });
    fireEvent.click(button);
    await waitFor(() => expect(h.triggers).toHaveLength(1));
    expect(h.triggers[0]).toEqual({ name: 'triggerImport', payload: { import_type: 'licensed_facilities', file_url: '/api/storage/pch.csv', dry_run: false, batch_id: 41, year: 2026 } });
  });

  it('sends the state and license type the file lacks columns for', async () => {
    wizard(LICENSED);
    const button = await readyToImport();
    expect(screen.getByRole('combobox', { name: 'State' })).toHaveTextContent('From the file');
    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'State' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('option', { name: 'PA' }));
    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'License type' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('option', { name: 'Assisted living' }));
    fireEvent.click(button);
    await waitFor(() => expect(h.triggers).toHaveLength(1));
    expect(h.triggers[0].payload).toMatchObject({ year: THIS_YEAR, state_filter: 'PA', license_type: 'assisted_living' });
  });

  it('leaves out the state and license type when the file carries them', async () => {
    wizard(LICENSED);
    fireEvent.click(await readyToImport());
    await waitFor(() => expect(h.triggers).toHaveLength(1));
    expect(Object.keys(h.triggers[0].payload).sort()).toEqual(['batch_id', 'dry_run', 'file_url', 'import_type', 'year']);
  });

  it('will not start without a four-digit year, and says why', async () => {
    wizard(LICENSED);
    const button = await readyToImport();
    fireEvent.change(screen.getByLabelText('Data year'), { target: { value: '26' } });
    expect(button).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a four-digit year, 2000 or later.');
    expect(screen.getByLabelText('Data year')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(button);
    expect(h.created).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Data year'), { target: { value: '2025' } });
    expect(button).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the server’s reason when the import is refused', async () => {
    h.triggerError = 'The Census geography isn’t loaded yet, so ZIP codes can’t be placed in counties.';
    wizard(LICENSED);
    fireEvent.click(await readyToImport());
    expect(await screen.findByText(/Census geography isn’t loaded yet/)).toBeInTheDocument();
  });
});

describe('a dataset that comes from CMS directly', () => {
  it('asks for nothing beside the file and sends no year', async () => {
    wizard(OTHER);
    const button = await readyToImport();
    expect(screen.queryByText('About this file')).toBeNull();
    expect(screen.queryByLabelText('Data year')).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(h.triggers).toHaveLength(1));
    expect(Object.keys(h.triggers[0].payload).sort()).toEqual(['batch_id', 'dry_run', 'file_url', 'import_type']);
  });
});

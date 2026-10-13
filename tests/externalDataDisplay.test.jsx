// @vitest-environment jsdom
/**
 * The provider page's NPI Registry card: it must offer the check even when
 * nothing has been fetched yet (it used to render nothing, hiding its own
 * button), and only admins get the merge panel (regular users can't edit
 * provider records).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { invoke, validations, role } = vi.hoisted(() => ({
  invoke: vi.fn(),
  validations: { rows: [] },
  role: { value: 'admin' },
}));

vi.mock('@/api/base44Client', () => ({
  base44: {
    functions: { invoke: (...a) => invoke(...a) },
    entities: new Proxy({}, {
      get: (_, name) => ({
        filter: () => Promise.resolve(name === 'ProviderNPIValidation' ? validations.rows : []),
        update: vi.fn(),
      }),
    }),
  },
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { role: role.value } }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn() }) }));

import ExternalDataDisplay from '../src/components/enrichment/ExternalDataDisplay';

const record = {
  npi: '1619978608', status: 'active', is_valid: true, npi_type: 'individual',
  first_name: 'FRANK', last_name: 'ABBATI', credentials: ['MD'], address: '2600 NAVARRE AVE', city: 'OREGON', state: 'OH', zip: '43616',
  phone: '419-691-9204', taxonomies: [], discrepancies: ['Name: "Frank Abbati-Jones" here, "FRANK ABBATI" in the registry.'],
  checked_at: '2026-10-10T06:00:00.000Z',
};

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ExternalDataDisplay npi="1619978608" provider={{ id: 1, npi: '1619978608', first_name: 'Frank', last_name: 'Abbati-Jones' }} />
    </QueryClientProvider>,
  );
}

describe('ExternalDataDisplay', () => {
  beforeEach(() => {
    validations.rows = [];
    role.value = 'admin';
    invoke.mockReset();
  });

  it('offers the registry check before any data exists, then shows the result', async () => {
    invoke.mockImplementation(async () => {
      validations.rows = [record];
      return { data: { success: true, validation: record } };
    });
    renderCard();
    expect(await screen.findByText(/Check this NPI against the national NPI Registry/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check NPI Registry' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('validateProviderNPI', { npi: '1619978608', checkDiscrepancies: true }));
    expect(await screen.findByText(/"Frank Abbati-Jones" here/)).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-check NPI Registry' })).toBeTruthy();
    expect(screen.getByText('NPI Registry comparison')).toBeTruthy();
  });

  it('hides the merge panel from non-admins', async () => {
    role.value = 'user';
    validations.rows = [record];
    renderCard();
    expect(await screen.findByText(/"Frank Abbati-Jones" here/)).toBeTruthy();
    expect(screen.queryByText('NPI Registry comparison')).toBeNull();
  });

  it('labels NPIs that are missing from the registry', async () => {
    validations.rows = [{ ...record, status: 'not_found', is_valid: false, npi_type: null, discrepancies: [] }];
    renderCard();
    expect(await screen.findByText('Not in registry')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: (...a) => invoke(...a) } } }));
vi.mock('@/hooks/usePageAccess', () => ({ usePageAccess: () => ({ isAdmin: true }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RefreshRollupsButton } from '../src/components/analytics/RollupFreshness';

describe('RefreshRollupsButton', () => {
  it('reloads the page data once when a refresh finishes, not on every render', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    let jobs = [{ job: 'cms_service_types', status: 'success' }];
    invoke.mockImplementation(async () => ({ data: { jobs } }));
    const ui = () => (
      <QueryClientProvider client={client}>
        {/* A fresh array each render, as CMSAnalytics passes it. */}
        <RefreshRollupsButton invalidateKey={['cmsAnalytics']} />
      </QueryClientProvider>
    );
    const view = render(ui());
    await act(async () => { await client.refetchQueries({ queryKey: ['rollupStatus'] }); });
    view.rerender(ui());
    view.rerender(ui());
    const forPage = () => invalidate.mock.calls.filter(([f]) => f?.queryKey?.[0] === 'cmsAnalytics').length;
    expect(forPage()).toBe(0);

    jobs = [{ job: 'cms_service_types', status: 'running' }];
    await act(async () => { await client.refetchQueries({ queryKey: ['rollupStatus'] }); });
    jobs = [{ job: 'cms_service_types', status: 'success' }];
    await act(async () => { await client.refetchQueries({ queryKey: ['rollupStatus'] }); });
    view.rerender(ui());
    expect(forPage()).toBe(1);
  });
});

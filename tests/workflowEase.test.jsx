// @vitest-environment jsdom
/**
 * Shared workflow helpers: URL-backed page state, the in-app confirm dialog,
 * the per-page error boundary, and the server-backed global search.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';

afterEach(cleanup);

const { invoke, entityFilter, entityList } = vi.hoisted(() => ({
  invoke: vi.fn(),
  entityFilter: vi.fn(() => Promise.resolve([])),
  entityList: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/api/base44Client', () => ({
  base44: {
    functions: { invoke: (...a) => invoke(...a) },
    entities: new Proxy({}, { get: () => ({ filter: entityFilter, list: entityList }) }),
  },
}));

vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));

vi.mock('@/pages.config.js', () => ({
  pagesConfig: { Pages: { Dashboard: () => null, Providers: () => null }, preloadPage: () => {} },
}));

import { useUrlState, readUrlState, writeUrlState } from '../src/hooks/useUrlState';
import { ConfirmProvider, useConfirm } from '../src/components/shared/ConfirmDialog';
import PageErrorBoundary, { isChunkLoadError } from '../src/components/shared/PageErrorBoundary';
import GlobalSearchDialog from '../src/components/search/GlobalSearchDialog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const DEFAULTS = { q: '', state: 'all', page: 0, archived: false };

describe('readUrlState / writeUrlState', () => {
  it('types values by their defaults', () => {
    const state = readUrlState(new URLSearchParams('q=heart&page=3&archived=true&state=PA'), DEFAULTS);
    expect(state).toEqual({ q: 'heart', state: 'PA', page: 3, archived: true });
  });

  it('falls back to defaults for missing or malformed values', () => {
    expect(readUrlState(new URLSearchParams('page=abc&archived=maybe'), DEFAULTS))
      .toEqual({ q: '', state: 'all', page: 0, archived: false });
  });

  it('drops defaults and blanks from the URL and keeps unrelated params', () => {
    const next = writeUrlState(new URLSearchParams('q=old&tab=x&page=2'), DEFAULTS, { q: '', page: 0, state: 'PA' });
    expect(next.toString()).toBe('tab=x&state=PA');
  });

  it('ignores keys it does not own', () => {
    expect(writeUrlState(new URLSearchParams(), DEFAULTS, { other: 'x' }).toString()).toBe('');
  });
});

function UrlStateHarness() {
  const [state, setState] = useUrlState(DEFAULTS);
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="state">{JSON.stringify(state)}</span>
      <span data-testid="search">{location.search}</span>
      <button onClick={() => setState({ state: 'PA', page: 2 })}>filter</button>
      <button onClick={() => setState((cur) => ({ page: cur.page + 1 }))}>next</button>
      <button onClick={() => { setState({ state: '' }); setState({ page: 9 }); }}>both</button>
      <button onClick={() => navigate('/other')}>leave</button>
    </div>
  );
}

describe('useUrlState', () => {
  it('writes state into the query string and restores it after navigating back', () => {
    render(
      <MemoryRouter initialEntries={['/list']}>
        <Routes>
          <Route path="/list" element={<UrlStateHarness />} />
          <Route path="/other" element={<BackButton />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('filter'));
    fireEvent.click(screen.getByText('next'));
    expect(screen.getByTestId('search').textContent).toBe('?state=PA&page=3');
    fireEvent.click(screen.getByText('leave'));
    fireEvent.click(screen.getByText('back'));
    expect(JSON.parse(screen.getByTestId('state').textContent)).toMatchObject({ state: 'PA', page: 3 });
  });

  it('keeps both of two updates made in a row', () => {
    render(
      <MemoryRouter initialEntries={['/list?state=OH&page=2']}>
        <Routes>
          <Route path="/list" element={<UrlStateHarness />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('both'));
    expect(screen.getByTestId('search').textContent).toBe('?page=9');
  });
});

function BackButton() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>back</button>;
}

function ConfirmHarness({ onResult }) {
  const confirm = useConfirm();
  return (
    <button onClick={async () => onResult(await confirm({ title: 'Delete it?', confirmLabel: 'Delete', destructive: true }))}>
      ask
    </button>
  );
}

describe('ConfirmDialog', () => {
  it('resolves true when confirmed', async () => {
    const onResult = vi.fn();
    render(<ConfirmProvider><ConfirmHarness onResult={onResult} /></ConfirmProvider>);
    fireEvent.click(screen.getByText('ask'));
    expect(await screen.findByText('Delete it?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('resolves false when cancelled', async () => {
    const onResult = vi.fn();
    render(<ConfirmProvider><ConfirmHarness onResult={onResult} /></ConfirmProvider>);
    fireEvent.click(screen.getByText('ask'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});

function Boom() {
  throw new Error('kaboom');
}

describe('PageErrorBoundary', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => console.error.mockRestore?.());

  it('contains a page crash and offers recovery', () => {
    render(<div><nav>sidebar</nav><PageErrorBoundary><Boom /></PageErrorBoundary></div>);
    expect(screen.getByText('sidebar')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This page ran into a problem');
    expect(screen.getByText('kaboom')).toBeInTheDocument();
  });

  it('recognises stale-bundle errors after a deploy', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/Page-abc.js'))).toBe(true);
    expect(isChunkLoadError(new Error('kaboom'))).toBe(false);
  });
});

describe('GlobalSearchDialog', () => {
  function renderSearch() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const navigated = [];
    function Spy() {
      const loc = useLocation();
      navigated.push(loc.pathname + loc.search);
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}>
          <GlobalSearchDialog open onOpenChange={() => {}} />
          <Spy />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return navigated;
  }

  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({
      data: { providers: [{ id: 1, npi: '1234567890', entity_type: 'Individual', first_name: 'Ann', last_name: 'Cardio', credential: 'MD' }] },
    });
  });

  it('searches providers on the server and opens the first result with Enter', async () => {
    const navigated = renderSearch();
    const input = screen.getByRole('combobox', { name: 'Search' });
    fireEvent.change(input, { target: { value: 'ann car' } });
    expect(await screen.findByText('Ann Cardio')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('searchProviders', { q: 'ann car', limit: 20 });
    expect(screen.getByRole('option', { name: /Ann Cardio/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigated.at(-1)).toBe('/ProviderDetail?npi=1234567890');
  });

  it('hides the previous query\'s results until the new search has caught up', async () => {
    const navigated = renderSearch();
    const input = screen.getByRole('combobox', { name: 'Search' });
    fireEvent.change(input, { target: { value: 'ann car' } });
    expect(await screen.findByText('Ann Cardio')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'zzq' } });
    expect(screen.queryByText('Ann Cardio')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigated.at(-1)).toBe('/');
  });

  it('says it is searching rather than "no results" while waiting', async () => {
    invoke.mockReturnValue(new Promise(() => {}));
    renderSearch();
    fireEvent.change(screen.getByRole('combobox', { name: 'Search' }), { target: { value: 'zzz' } });
    expect(screen.getByRole('status')).toHaveTextContent('Searching');
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.getByRole('status')).toHaveTextContent('Searching');
  });

  it('keeps "Searching" until the lead-list search has answered too', async () => {
    invoke.mockResolvedValue({ data: { providers: [] } });
    let answerLists;
    entityList.mockReturnValueOnce(new Promise((resolve) => { answerLists = resolve; }));
    renderSearch();
    fireEvent.change(screen.getByRole('combobox', { name: 'Search' }), { target: { value: 'zzz' } });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(screen.getByRole('status')).toHaveTextContent('Searching');
    await act(async () => { answerLists([]); });
    expect(await screen.findByText('No results found for "zzz"')).toBeInTheDocument();
  });
});

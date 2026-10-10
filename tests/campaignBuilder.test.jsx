// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { entities } = vi.hoisted(() => ({
  entities: {
    LeadList: { list: vi.fn(() => Promise.resolve([{ id: 7, name: 'Cardiology', member_count: 12 }])) },
    LeadListMember: { filter: vi.fn(() => Promise.resolve([{ npi: '1234567890' }])) },
    Provider: { filter: vi.fn(() => Promise.resolve([{ npi: '1234567890', entity_type: 'Individual', first_name: 'Ann', last_name: 'Cardio', credential: 'MD' }])) },
    ProviderTaxonomy: { filter: vi.fn(() => Promise.resolve([{ taxonomy_description: 'Cardiology', is_primary: true }])) },
    ProviderLocation: { filter: vi.fn(() => Promise.resolve([{ city: 'Erie', state: 'PA', is_primary: true }])) },
  },
}));

vi.mock('@/api/base44Client', () => ({ base44: { entities, functions: { invoke: vi.fn() } } }));

import CampaignBuilder from '../src/components/outreach/CampaignBuilder';

function renderBuilder(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CampaignBuilder {...props} />
    </QueryClientProvider>,
  );
}

describe('CampaignBuilder', () => {
  it('inserts merge fields and previews them for a real provider on the list', async () => {
    renderBuilder({ initialLeadListId: '7' });
    fireEvent.click(screen.getByRole('button', { name: /Next: write the message/i }));
    fireEvent.change(screen.getByLabelText('Subject *'), { target: { value: 'Hello ' } });
    fireEvent.click(screen.getAllByRole('button', { name: '+ First name' })[0]);
    fireEvent.change(screen.getByLabelText('Message *'), { target: { value: 'We support {{specialty}} in {{location_city}}.' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: preview/i }));
    expect(await screen.findByText('Hello Ann')).toBeInTheDocument();
    expect(screen.getByText('We support Cardiology in Erie.')).toBeInTheDocument();
    expect(screen.getByText(/As Dr\. Ann Cardio will see it/)).toBeInTheDocument();
  });

  it("won't send to a preselected list until it has loaded", async () => {
    entities.LeadList.list.mockReturnValueOnce(new Promise(() => {}));
    renderBuilder({ initialLeadListId: '7' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Send' }), { button: 0 });
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send now/ })).toBeDisabled();
  });

  it('shows placeholders when no list is chosen', () => {
    renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: /Next: write the message/i }));
    fireEvent.change(screen.getByLabelText('Subject *'), { target: { value: 'Hi {{first_name}}' } });
    fireEvent.click(screen.getByRole('button', { name: /Next: preview/i }));
    expect(screen.getByText('Hi [First name]')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import CountyIntelligence from '../src/pages/CountyIntelligence';

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }));
vi.mock('@/components/layout/PageTabs', () => ({ default: () => null }));
vi.mock('@/api/functionResult', () => ({ invokeOrThrow: vi.fn() }));
vi.mock('@/lib/BusinessLineContext', () => ({ useBusinessLine: () => ({ profile: null }) }));
vi.mock('../src/components/market/CountyMarketProfile', () => ({ default: () => null }));
vi.mock('../src/components/market/MarketReferenceCards', () => ({ CountyReferenceCard: () => null }));
vi.mock('../src/components/market/HospitalSourcesTable', () => ({ default: () => null }));
vi.mock('../src/components/market/PacCompetitorsTable', () => ({ default: () => null }));
vi.mock('../src/components/market/ReferralSourcesTable', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function showCounty(data) {
  const refetch = vi.fn();
  useQuery.mockImplementation(({ queryKey }) => queryKey[0] === 'countyIntelligence'
    ? { data, refetch }
    : { data: { counties: [] } });
  render(<MemoryRouter initialEntries={['/CountyIntelligence?state=PA&county=42003']}><CountyIntelligence /></MemoryRouter>);
  return refetch;
}

describe('County Intelligence response guards', () => {
  it.each([undefined, null, {}, { county: null }, { message: 'County data is being refreshed.' }])('handles missing county data: %j', (data) => {
    const refetch = showCounty(data);
    expect(screen.getByRole('status').textContent).toContain(data?.message || 'County information is unavailable.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('renders a valid county without optional sampling metadata', () => {
    showCounty({
      county: { name: 'Allegheny County', fips: '42003' }, state: 'PA', zip_areas: 50,
      summary: {}, topSpecialties: [], topServices: [], referrals: [], facilities: [], facilitySummary: [], providers: [],
    });
    expect(screen.getByRole('heading', { name: 'Allegheny County, PA' })).toBeTruthy();
    expect(screen.getByText('FIPS 42003')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import FacilityDetail from '../src/pages/FacilityDetail';

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: vi.fn() } } }));
vi.mock('../src/components/reports/ComprehensiveReport', () => ({ default: () => null }));
vi.mock('../src/components/market/HospitalCatchmentCard', () => ({ default: () => null }));
vi.mock('../src/components/compliance/DataSourcesFooter', () => ({ default: () => null }));

afterEach(cleanup);

it('does not group facility reporting years or raw identifiers', () => {
  useQuery.mockReturnValue({ data: {
    facility_name: 'Example Hospital',
    facility_types: ['hospital_general_info'],
    data_years: [2025],
    by_type: { hospital_general_info: [{
      data_year: 2025, total_discharges: 12345,
      raw_data: { 'ZIP Code': '02108', 'Associate ID': '0012345678', NPI: '1234567890', CCN: '010001', Year: 2025 },
    }] },
  } });
  render(<MemoryRouter initialEntries={['/FacilityDetail?id=010001&group=hospital']}><FacilityDetail /></MemoryRouter>);
  const table = within(screen.getByRole('table'));
  for (const text of ['2025', '02108', '0012345678', '1234567890', '010001', '12,345']) expect(table.getAllByText(text).length).toBeGreaterThan(0);
  expect(screen.queryByText('2,025')).toBeNull();
});

// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RawDataTable } from '../src/pages/FacilityDetail';
import ProviderCMSDataCard from '../src/components/providers/ProviderCMSDataCard';

afterEach(cleanup);

const raw = {
  'ZIP CODE': '02108',
  zip: 15213,
  associate_id: 159311549,
  provider_number: '010001',
  NPI: 1234567890,
  data_year: 2024,
  total_services: 12345,
  total_payments: 2000000,
};

function expectIdentifiers() {
  for (const text of ['02108', '15213', '159311549', '010001', '1234567890', '2024']) {
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  }
  for (const text of ['2,108', '15,213', '159,311,549', '10,001', '1,234,567,890', '2,024']) {
    expect(screen.queryByText(text)).toBeNull();
  }
}

describe('CMS identifier displays', () => {
  it('keeps facility raw identifiers and the core reporting year plain while formatting quantities', () => {
    render(<RawDataTable rows={[{ data_year: 2024, total_discharges: 12345, raw_data: raw }]} />);
    expectIdentifiers();
    expect(screen.getAllByText('2024')).toHaveLength(2);
    expect(screen.getAllByText('12,345').length).toBeGreaterThan(0);
    expect(screen.getByText('$2.0M')).toBeInTheDocument();
  });

  it('keeps provider raw identifiers plain while formatting quantities', () => {
    render(<ProviderCMSDataCard clinicianData={{ has_data: true, by_type: {
      clinician_national_file: [{ data_year: 2024, raw_data: raw }],
    } }} />);
    fireEvent.click(screen.getByRole('button', { name: /Clinician Profile/ }));
    expectIdentifiers();
    expect(screen.getByText('12,345')).toBeInTheDocument();
    expect(screen.getByText('2,000,000')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ProviderCMSDataCard from '../src/components/providers/ProviderCMSDataCard';
import { RawDataTable } from '../src/pages/FacilityDetail';

afterEach(cleanup);

describe('CMS year displays', () => {
  it('renders facility year columns and raw year fields without grouping', () => {
    render(
      <RawDataTable rows={[{
        data_year: 2026,
        total_days_of_care: 2026,
        raw_data: {
          Year: '2026',
          fiscal_year: 2026,
          total_patients: 2026,
          'Fiscal Year End Date': '2026-12-31',
          year_total_patients: 2026,
        },
      }]} />,
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual(['2026', '2,026', '2026', '2026', '2,026', '2026-12-31', '2,026']);
    expect(screen.getByText('Summary — latest reporting year 2026')).toBeInTheDocument();
  });

  it('renders numeric and string year fields without grouping in provider details', () => {
    render(
      <ProviderCMSDataCard
        clinicianData={{
          has_data: true,
          by_type: {
            clinician_national_file: [{
              data_year: 2026,
              raw_data: {
                Year: 2026,
                data_year: '2026',
                'Program Year': 2026,
                BENE_ENROLLMT_REF_YR: '2026',
                total_beneficiaries: 2026,
                total_services: '2026',
                missing_year: null,
                'Fiscal Year End Date': '2026-12-31',
              },
            }],
          },
        }}
      />,
    );
    expect(screen.getByRole('button', { name: /Clinician Profile/ })).toHaveTextContent('2026');
    fireEvent.click(screen.getByRole('button', { name: /Clinician Profile/ }));
    for (const label of ['Year', 'data year', 'Program Year', 'BENE ENROLLMT REF YR']) {
      expect(within(screen.getByText(label).parentElement).getByText('2026')).toBeInTheDocument();
    }
    for (const label of ['total beneficiaries', 'total services']) {
      expect(within(screen.getByText(label).parentElement).getByText('2,026')).toBeInTheDocument();
    }
    expect(within(screen.getByText('missing year').parentElement).getByText('—')).toBeInTheDocument();
    expect(within(screen.getByText('Fiscal Year End Date').parentElement).getByText('2026-12-31')).toBeInTheDocument();
  });
});

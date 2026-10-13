// @vitest-environment jsdom
/**
 * The market views: County Intel's market tabs, the Market Intelligence
 * county table, the Territory map's county layer, and the cards.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/functionResult', () => ({ invokeOrThrow: (...a) => invoke(...a) }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: vi.fn(() => Promise.resolve({ data: {} })) } } }));
vi.mock('../src/components/territory/InteractiveProviderMap', () => ({ default: () => <div data-testid="map" /> }));
vi.mock('../src/components/compliance/DataSourcesFooter', () => ({ default: () => null }));
vi.mock('../src/components/leadlists/AddToLeadListDialog', () => ({ default: ({ open, npis }) => (open ? <div data-testid="list-dialog">{npis.length} NPIs</div> : null) }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>, BarChart: ({ children }) => <div data-testid="chart">{children}</div>,
  Bar: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, Legend: () => null, CartesianGrid: () => null,
}));

import CountyIntelligence from '../src/pages/CountyIntelligence';
import MarketIntelligence from '../src/pages/MarketIntelligence';
import TerritoryIntelligence from '../src/pages/TerritoryIntelligence';
import CountyMarketProfile from '../src/components/market/CountyMarketProfile';
import { FacilitySummaryCard } from '../src/pages/FacilityDetail';
import ReferralPotentialCard from '../src/components/market/ReferralPotentialCard';
import CountyMetricLayer from '../src/components/market/CountyMetricLayer';
import PacCompetitorsTable from '../src/components/market/PacCompetitorsTable';
import MarketPositionCard from '../src/components/market/MarketPositionCard';
import HospitalCatchmentCard from '../src/components/market/HospitalCatchmentCard';
import ComplianceDisclaimer from '../src/components/compliance/ComplianceDisclaimer';
import { COUNTY_LAYER_METRICS } from '../src/lib/marketLayers';

function Probe() {
  return <output data-testid="url">{useLocation().search}</output>;
}

function renderAt(path, Page, route) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={<><Page /><Probe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const COUNTY = {
  state: 'PA', county: { fips: '42003', name: 'Allegheny County' }, zip_areas: 2,
  summary: { totalProviders: 30, providersExact: true, individualProviders: 20, orgProviders: 10, totalFacilities: 0, totalPayments: 0, totalDischarges: 0 },
  sample: { sampled: false, details_cover_all: true }, topSpecialties: [], facilitySummary: [], facilities: [], providers: [], referrals: [], topServices: [],
};
const ROLLUPS = { county_market_profile: { status: 'success', refreshed_at: '2026-10-10T03:00:00Z', error: null }, county_hospital_sources: { status: 'success', refreshed_at: '2026-10-10T03:00:00Z', error: null }, hospital_discharge_mix: { status: 'never_run', refreshed_at: null, error: null } };
const MARKET = {
  state: 'PA', county: COUNTY.county,
  profile: { available: true, benes: 310000, original_medicare: 118000, ma_benes: 192000, ma_penetration: 0.62, benes_85_plus: 21000, dual: 40000, enrollment_period: '2026-06', hospitals_serving: 23, top_hospital_share: 0.31, hsa_year: '2025', hha_providers: 60, hha_users: 24000, hha_users_pct: 11.05, std_per_capita_hha: 612, hha_agencies: 40, hospice_providers: 30, hospice_users: 9000, hospice_users_pct: 3.2, std_per_capita_hospice: 410, hospice_agencies: 25, snf_providers: 70, snf_users: 12000, snf_users_pct: 5.1, std_per_capita_snf: 1100, snf_facilities: 68, std_per_capita_total: 12400, variation_year: '2024', readmission_rate: 0.152, er_visits_per_1000: 640, avg_hcc_score: 1.12 },
  hospital_sources: { data_year: '2025', total: 23, rows: [
    { ccn: '390001', name: 'UPMC PRESBYTERIAN', city: 'Pittsburgh', state: 'PA', cases: 12000, days: 60000, share: 0.31, rank: 1, discharge_mix: { data_year: '2024', pct_snf: 12.5, pct_hha: 8.1, pct_hospice: 1.2 } },
    { ccn: '390002', name: 'ALLEGHENY GENERAL', city: 'Pittsburgh', state: 'PA', cases: 8000, days: 40000, share: 0.2, rank: 2, discharge_mix: null },
  ] },
  competitors: { snf: { data_year: '2024', rows: [{ ccn: '395001', name: 'KANE REGIONAL', city: 'Pittsburgh', state: 'PA', benes: 900, stays: 1200, share: 0.12, rank: 1, providers_in_market: 70, payment: 2e7, dual_pct: 40, risk_score: 2.4, facility_group: 'snf' }] }, hha: { data_year: null, rows: [] }, hospice: { data_year: null, rows: [] }, irf: { data_year: null, rows: [] }, ltch: { data_year: null, rows: [] } },
  trends: { snf: [{ data_year: '2023', benes: 7000, stays: 9000, providers: 72 }, { data_year: '2024', benes: 7400, stays: 9500, providers: 70 }] },
  coverage: { hha: [], hospice: [] },
  labels: { snf: 'Skilled nursing', hha: 'Home health', hospice: 'Hospice', irf: 'Inpatient rehab', ltch: 'Long-term care hospital' },
  vintages: { enrollment: '2026-06', hospital_service_area: '2025' },
  rollups: ROLLUPS,
};
const SOURCES = {
  state: 'PA', county: COUNTY.county, data_year: '2024', truncated: false, limit: 25, rollups: { referral_sources: ROLLUPS.county_market_profile },
  index_note: 'Referral index (0–100): 50 points for volume.',
  rows: [
    { npi: '1000000001', name: 'Ada Lovelace, MD', specialty: 'Internal Medicine', specialty_group: 'internal_medicine', specialty_group_label: 'Internal Medicine', benes: 620, avg_risk_score: 2.1, chronic: { alzheimer: 0.12, chf: 0.2 }, eligible: { hha: true, hospice: true, dme: false }, hospital_ccns: ['390001'], affiliations: 2, referral_index: 96, rank_in_county: 1, lead_score: 88 },
    { npi: '1000000002', name: 'Bo Hart', specialty: 'Cardiology', specialty_group: 'cardiology', specialty_group_label: 'Cardiology', benes: 500, avg_risk_score: 1.9, chronic: {}, eligible: { hha: false, hospice: false, dme: false }, hospital_ccns: [], affiliations: 0, referral_index: 69, rank_in_county: 2, lead_score: null },
  ],
};

function countyAnswers(fn, payload) {
  if (fn === 'getGeoCounties') return { counties: [{ fips: '42003', name: 'Allegheny County' }] };
  if (fn === 'getCountyIntelligence') return COUNTY;
  if (fn === 'getCountyMarket') return MARKET;
  if (fn === 'getReferralSources') return payload?.specialty_group ? { ...SOURCES, rows: SOURCES.rows.filter((r) => r.specialty_group === payload.specialty_group) } : SOURCES;
  throw new Error(`unexpected ${fn}`);
}

describe('CountyIntelligence market tabs', () => {
  it('shows a county-not-found message instead of dereferencing an incomplete county response', async () => {
    invoke.mockReset().mockImplementation((fn) => Promise.resolve(fn === 'getCountyIntelligence'
      ? { state: 'PA', needsCounty: false, summary: {} }
      : fn === 'getGeoCounties' ? { counties: [] } : MARKET));
    renderAt('/CountyIntelligence?state=PA&county=42003', CountyIntelligence, '/CountyIntelligence');
    expect(await screen.findByText('That county wasn’t found. Pick one from the list.')).toBeInTheDocument();
    expect(screen.queryByText(/ZIP areas/)).toBeNull();
  });

  it('opens the hospital sources tab from the URL and lists hospitals with their discharge mix', async () => {
    invoke.mockReset().mockImplementation((fn, payload) => Promise.resolve(countyAnswers(fn, payload)));
    renderAt('/CountyIntelligence?state=PA&county=42003&tab=hospitals', CountyIntelligence, '/CountyIntelligence');
    const link = await screen.findByRole('link', { name: 'UPMC PRESBYTERIAN' });
    expect(link).toHaveAttribute('href', '/FacilityDetail?id=390001&group=hospital');
    expect(invoke).toHaveBeenCalledWith('getCountyMarket', { state: 'PA', county_fips: '42003' });
    const row = link.closest('tr');
    expect(within(row).getByText('12,000')).toBeInTheDocument();
    expect(within(row).getByText('31%')).toBeInTheDocument();
    expect(within(row).getByText('12.5%')).toBeInTheDocument();
    const other = screen.getByRole('link', { name: 'ALLEGHENY GENERAL' }).closest('tr');
    expect(within(other).getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('note')).toHaveTextContent(/Hospital sources show where/);
    expect(screen.getByText(/Computed /)).toBeInTheDocument();
    // The table holds the top two of the county's 23 hospitals, and says so: their shares can't add up to 100%.
    expect(screen.getByText(/Showing the top 2 of 23 hospitals/)).toBeInTheDocument();
  });

  it('switches to the market profile through the tab strip, keeping the tab in the URL', async () => {
    invoke.mockReset().mockImplementation((fn, payload) => Promise.resolve(countyAnswers(fn, payload)));
    renderAt('/CountyIntelligence?state=PA&county=42003', CountyIntelligence, '/CountyIntelligence');
    await screen.findByRole('heading', { name: 'Allegheny County, PA' });
    expect(invoke).not.toHaveBeenCalledWith('getCountyMarket', expect.anything());
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^Market$/ }));
    fireEvent.click(screen.getByRole('tab', { name: /^Market$/ }));
    expect(await screen.findByText('Medicare beneficiaries')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('tab=market');
    expect(screen.getByText('310,000')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.getByText('24,000 (11.1%)')).toBeInTheDocument();
    expect(screen.getByText(/Data: Medicare enrollment 2026-06; Hospital Service Area 2025\./)).toBeInTheDocument();
  });

  it('lists competitors by setting with a trend chart', async () => {
    invoke.mockReset().mockImplementation((fn, payload) => Promise.resolve(countyAnswers(fn, payload)));
    renderAt('/CountyIntelligence?state=PA&county=42003&tab=competitors', CountyIntelligence, '/CountyIntelligence');
    const link = await screen.findByRole('link', { name: 'KANE REGIONAL' });
    expect(link).toHaveAttribute('href', '/FacilityDetail?id=395001&group=snf');
    // The button counts the county's providers (70), not the rows listed (1).
    expect(screen.getByRole('button', { name: 'Skilled nursing (70)', pressed: true })).toBeInTheDocument();
    expect(screen.getByText('Showing the top 1 of 70 providers.')).toBeInTheDocument();
    expect(screen.getByTestId('chart')).toBeInTheDocument();
    // The chart's numbers are also there as a table, for a screen reader.
    const table = screen.getByRole('table', { name: 'Skilled nursing: Medicare beneficiaries served and providers by year' });
    expect(within(table).getAllByRole('row').map((r) => r.textContent)).toEqual(['YearBeneficiariesProviders', '20237,00072', '20247,40070']);
    fireEvent.click(screen.getByRole('button', { name: 'Hospice' }));
    expect(screen.getByText(/No Hospice providers in the post-acute utilization file/)).toBeInTheDocument();
  });

  it('lists referral sources with their components and offers to add them to a lead list', async () => {
    invoke.mockReset().mockImplementation((fn, payload) => Promise.resolve(countyAnswers(fn, payload)));
    renderAt('/CountyIntelligence?state=PA&county=42003&tab=referrals', CountyIntelligence, '/CountyIntelligence');
    const link = await screen.findByRole('link', { name: 'Ada Lovelace, MD' });
    expect(invoke).toHaveBeenCalledWith('getReferralSources', { state: 'PA', county_fips: '42003', limit: 25 });
    // The tab asks for its own list; the county market payload (five rollup reads) is for the tabs that show it.
    expect(invoke).not.toHaveBeenCalledWith('getCountyMarket', expect.anything());
    const row = link.closest('tr');
    expect(within(row).getByText('96')).toBeInTheDocument();
    expect(within(row).getByText('620')).toBeInTheDocument();
    expect(within(row).getByText('HHA')).toBeInTheDocument();
    expect(within(row).getByText('Hospice')).toBeInTheDocument();
    expect(within(row).getByText('88')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: 'Bo Hart' }).closest('tr')).getByText('Unscored')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add these 2 to a lead list/ }));
    expect(screen.getByTestId('list-dialog')).toHaveTextContent('2 NPIs');
  });
});

describe('referral sources list', () => {
  // The cell of the "Hospitals" column in a clinician's row.
  const hospitalsCell = (name) => {
    const col = screen.getAllByRole('columnheader').findIndex((h) => h.textContent === 'Hospitals');
    return within(screen.getByRole('link', { name }).closest('tr')).getAllByRole('cell')[col];
  };

  it('counts hospital affiliations once the file is imported, a clinician with none included, without the note', async () => {
    invoke.mockReset().mockImplementation((fn, payload) => Promise.resolve(countyAnswers(fn, payload)));
    renderAt('/CountyIntelligence?state=PA&county=42003&tab=referrals', CountyIntelligence, '/CountyIntelligence');
    await screen.findByRole('link', { name: 'Ada Lovelace, MD' });
    expect(hospitalsCell('Ada Lovelace, MD')).toHaveTextContent(/^1$/);
    expect(hospitalsCell('Bo Hart')).toHaveTextContent(/^0$/);
    expect(screen.queryByText(/Facility Affiliation file/)).toBeNull();
  });

  it('shows a dash, and says why, while the Facility Affiliation file has not been imported (never 0)', async () => {
    invoke.mockReset().mockImplementation((fn, payload) => Promise.resolve(fn === 'getReferralSources'
      ? { ...SOURCES, rows: SOURCES.rows.map((r) => ({ ...r, hospital_ccns: [], affiliations: null })) }
      : countyAnswers(fn, payload)));
    renderAt('/CountyIntelligence?state=PA&county=42003&tab=referrals', CountyIntelligence, '/CountyIntelligence');
    await screen.findByRole('link', { name: 'Ada Lovelace, MD' });
    expect(hospitalsCell('Ada Lovelace, MD')).toHaveTextContent(/^—$/);
    expect(hospitalsCell('Bo Hart')).toHaveTextContent(/^—$/);
    expect(screen.getByText(/A dash under Hospitals means the Facility Affiliation file has not been imported yet/)).toBeInTheDocument();
  });

  // The cell of the "Home health certified" column in a clinician's row.
  const certifiedCell = (name) => {
    const col = screen.getAllByRole('columnheader').findIndex((h) => h.textContent === 'Home health certified');
    return within(screen.getByRole('link', { name }).closest('tr')).getAllByRole('cell')[col];
  };

  it('shows the patients each clinician certified for home health, and "≤10" for one CMS does not list, with the note', async () => {
    invoke.mockReset().mockImplementation((fn, payload) => Promise.resolve(fn === 'getReferralSources'
      ? { ...SOURCES, certifications_loaded: true, certifications_year: '2023', rows: SOURCES.rows.map((r, i) => ({ ...r, hh_cert_benes: i === 0 ? 1234 : 0, hospice_oversight_benes: 0, hh_cert_year: '2023' })) }
      : countyAnswers(fn, payload)));
    renderAt('/CountyIntelligence?state=PA&county=42003&tab=referrals', CountyIntelligence, '/CountyIntelligence');
    await screen.findByRole('link', { name: 'Ada Lovelace, MD' });
    expect(certifiedCell('Ada Lovelace, MD')).toHaveTextContent(/^1,234$/);
    expect(certifiedCell('Bo Hart')).toHaveTextContent(/^≤10$/);
    // The note names the certification file's own year, and says the figure adds up the care settings CMS counts separately.
    expect(screen.getByText(/certified for home health in 2023, as CMS counts them for each care setting \(a patient certified in two settings counts in both\)/)).toBeInTheDocument();
    expect(screen.getByText(/CMS lists a setting only above 10 patients, so “≤10” means no setting is listed: 10 or fewer in each, or none/)).toBeInTheDocument();
    expect(screen.queryByText(/has not been imported yet, so who certifies/)).toBeNull();
    // The entity is written out in the string, so it must read as an ampersand, not as "&amp;".
    expect(screen.getByText(/ranked by a referral index built from the patients they certified for home health \(Physician & Other Practitioners by Provider and Service\), Medicare volume/)).toBeInTheDocument();
    expect(screen.queryByText(/&amp;/)).toBeNull();
  });

  it('shows a dash, and says why, while the Home Health Certifications file has not been imported (never 0)', async () => {
    invoke.mockReset().mockImplementation((fn, payload) => Promise.resolve(fn === 'getReferralSources'
      ? { ...SOURCES, certifications_loaded: false, rows: SOURCES.rows.map((r) => ({ ...r, hh_cert_benes: null, hospice_oversight_benes: null })) }
      : countyAnswers(fn, payload)));
    renderAt('/CountyIntelligence?state=PA&county=42003&tab=referrals', CountyIntelligence, '/CountyIntelligence');
    await screen.findByRole('link', { name: 'Ada Lovelace, MD' });
    expect(certifiedCell('Ada Lovelace, MD')).toHaveTextContent(/^—$/);
    expect(certifiedCell('Bo Hart')).toHaveTextContent(/^—$/);
    expect(screen.getByText(/A dash under Home health certified means the Home Health Certifications file has not been imported yet/)).toBeInTheDocument();
    expect(screen.queryByText(/ranked by a referral index built from the patients they certified/)).toBeNull();
  });

  it('says when the ranked list goes on past the rows shown', async () => {
    invoke.mockReset().mockImplementation((fn, payload) => Promise.resolve(fn === 'getReferralSources' ? { ...SOURCES, truncated: true, searched: 25 } : countyAnswers(fn, payload)));
    renderAt('/CountyIntelligence?state=PA&county=42003&tab=referrals', CountyIntelligence, '/CountyIntelligence');
    await screen.findByRole('link', { name: 'Ada Lovelace, MD' });
    expect(screen.getByText('More clinicians are ranked below these; raise the limit to see them.')).toBeInTheDocument();
  });

  it('stays quiet when the list is complete', async () => {
    invoke.mockReset().mockImplementation((fn, payload) => Promise.resolve(countyAnswers(fn, payload)));
    renderAt('/CountyIntelligence?state=PA&county=42003&tab=referrals', CountyIntelligence, '/CountyIntelligence');
    await screen.findByRole('link', { name: 'Ada Lovelace, MD' });
    expect(screen.queryByText(/ranked below these/)).toBeNull();
  });
});

describe('MarketIntelligence', () => {
  const LAYER = {
    state: 'PA', all: true, vintages: { enrollment: '2026-06' }, rollups: ROLLUPS,
    counties: [
      { fips: '42003', name: 'Allegheny County', values: { benes: 310000, ma_penetration: 0.62, benes_85_plus: 21000, hha_users_pct: 11.05, hospice_users_pct: 3.2, snf_users_pct: 5.1, snf_providers: 70, hospitals_serving: 23 } },
      { fips: '42019', name: 'Butler County', values: { benes: 48000, ma_penetration: 0.55, benes_85_plus: 3000, hha_users_pct: 9, hospice_users_pct: 2.8, snf_users_pct: 4, snf_providers: 9, hospitals_serving: 11 } },
    ],
  };

  it('shows every county side by side, sorted by the URL, and links to the county market tab', async () => {
    invoke.mockReset().mockResolvedValue(LAYER);
    renderAt('/MarketIntelligence', MarketIntelligence, '/MarketIntelligence');
    const rows = await screen.findAllByRole('row');
    expect(invoke).toHaveBeenCalledWith('getCountyMarketLayer', { state: 'PA', all: true });
    expect(within(rows[1]).getByRole('link', { name: 'Allegheny County' })).toHaveAttribute('href', '/CountyIntelligence?state=PA&county=42003&tab=market');
    expect(within(rows[1]).getByText('310,000')).toBeInTheDocument();
    expect(within(rows[1]).getByText('62.0%')).toBeInTheDocument();
    expect(within(rows[1]).getByText('11.1%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Medicare Advantage share' }));
    expect(screen.getByTestId('url')).toHaveTextContent('sort=ma_penetration');
    fireEvent.click(screen.getByRole('button', { name: 'Medicare Advantage share' }));
    expect(screen.getByTestId('url')).toHaveTextContent('dir=asc');
    expect(within(screen.getAllByRole('row')[1]).getByText('Butler County')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Hospitals serving residents column' }));
    expect(screen.queryByRole('button', { name: /Hospitals serving residents/ })).toBeNull();
  });

  it('counts the facilities located in each county by default and names the billing counts as such', async () => {
    invoke.mockReset().mockResolvedValue({
      ...LAYER,
      counties: LAYER.counties.map((c, i) => ({ ...c, values: { ...c.values, snf_facilities: i ? 8 : 52 } })),
    });
    renderAt('/MarketIntelligence', MarketIntelligence, '/MarketIntelligence');
    await screen.findByRole('link', { name: 'Allegheny County' });
    // 52 facilities are located in the county; the 70 in the saturation file also bill for its residents.
    expect(screen.getByRole('button', { name: 'Skilled nursing facilities in county' })).toBeInTheDocument();
    expect(within(screen.getAllByRole('row')[1]).getByText('52')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skilled nursing facilities billing' })).toBeNull();
    expect(COUNTY_LAYER_METRICS.find((m) => m.key === 'snf_providers').label).toBe('Skilled nursing facilities billing');
  });

  it('keeps "no metric columns" in the URL when the last column is removed, instead of bringing the defaults back', async () => {
    invoke.mockReset().mockResolvedValue(LAYER);
    renderAt('/MarketIntelligence?cols=benes', MarketIntelligence, '/MarketIntelligence');
    await screen.findByRole('link', { name: 'Allegheny County' });
    expect(screen.getAllByRole('columnheader')).toHaveLength(2); // County and one metric
    fireEvent.click(screen.getByRole('button', { name: 'Remove Medicare beneficiaries column' }));
    expect(screen.getByTestId('url')).toHaveTextContent('cols=none');
    expect(screen.getAllByRole('columnheader')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Remove .* column/ })).toBeNull();
  });

  it('opens with no metric columns when the URL says none, and lets one be added back', async () => {
    invoke.mockReset().mockResolvedValue(LAYER);
    renderAt('/MarketIntelligence?cols=none', MarketIntelligence, '/MarketIntelligence');
    await screen.findByRole('link', { name: 'Allegheny County' });
    expect(screen.getAllByRole('columnheader')).toHaveLength(1);
  });

  it('puts the "Add a column" picker back to its placeholder after a pick', async () => {
    // jsdom has no pointer capture or scrolling, which Radix's select uses when it opens.
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.releasePointerCapture = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};
    invoke.mockReset().mockResolvedValue(LAYER);
    renderAt('/MarketIntelligence?cols=benes', MarketIntelligence, '/MarketIntelligence');
    await screen.findByRole('link', { name: 'Allegheny County' });
    const picker = screen.getByRole('combobox', { name: 'Add a column' });
    expect(picker).toHaveTextContent('Pick a metric');
    fireEvent.pointerDown(picker, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('option', { name: 'Hospitals serving residents' }));
    expect(screen.getByTestId('url')).toHaveTextContent('cols=benes%2Chospitals_serving');
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    // Not blank, and not showing the metric that has just become a column.
    expect(screen.getByRole('combobox', { name: 'Add a column' })).toHaveTextContent('Pick a metric');
  });

  it('says when a state has no profiles yet', async () => {
    invoke.mockReset().mockResolvedValue({ ...LAYER, state: 'OH', counties: [] });
    renderAt('/MarketIntelligence?state=OH', MarketIntelligence, '/MarketIntelligence');
    expect(await screen.findByText(/No county profiles for OH yet/)).toBeInTheDocument();
  });
});

describe('TerritoryIntelligence county layer', () => {
  it('shows a market metric for every county when one is picked', async () => {
    invoke.mockReset().mockImplementation((fn) => Promise.resolve(fn === 'getCountyMarketLayer'
      ? { state: 'PA', metric: 'ma_penetration', label: 'Medicare Advantage share', format: 'percent', vintage: '2026-06', counties: [{ fips: '42003', name: 'Allegheny County', value: 0.62 }, { fips: '42019', name: 'Butler County', value: null }], rollups: ROLLUPS }
      : { providers: [], availableStates: [], scope: { state: 'PA', label: '0 providers', sample_size: 0 }, counties: [], geography: { loaded: true, vintage: '2020' } }));
    renderAt('/TerritoryIntelligence?tab=density&layer=ma_penetration', TerritoryIntelligence, '/TerritoryIntelligence');
    const link = await screen.findByRole('link', { name: /Allegheny County/ });
    expect(invoke).toHaveBeenCalledWith('getCountyMarketLayer', { state: 'PA', metric: 'ma_penetration' });
    expect(link).toHaveAttribute('href', '/CountyIntelligence?state=PA&county=42003&tab=market');
    expect(link).toHaveTextContent('62.0%');
    expect(screen.queryByRole('link', { name: /Butler County/ })).toBeNull();
    expect(screen.getByText(/Medicare Advantage share by county in PA/)).toBeInTheDocument();
  });
});

describe('TerritoryIntelligence county layer with all states', () => {
  it('shows provider density and says a state is needed, instead of accepting a metric it cannot map', async () => {
    invoke.mockReset().mockImplementation((fn) => Promise.resolve(fn === 'getCountyMarketLayer'
      ? { state: 'PA', counties: [], rollups: ROLLUPS }
      : { providers: [], availableStates: [], scope: { state: 'ALL', label: '0 providers', sample_size: 0 }, counties: [], geography: { loaded: true, vintage: '2020' } }));
    renderAt('/TerritoryIntelligence?tab=density&state=ALL&layer=benes', TerritoryIntelligence, '/TerritoryIntelligence');
    const picker = await screen.findByRole('combobox', { name: 'County layer' });
    expect(picker).toBeDisabled();
    expect(picker).toHaveTextContent('Provider density');
    expect(screen.getByText('Pick a state to map market metrics by county.')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('getCountyMarketLayer', expect.anything());
  });

  it('lets a state pick its layer', async () => {
    invoke.mockReset().mockImplementation((fn) => Promise.resolve(fn === 'getCountyMarketLayer'
      ? { state: 'PA', metric: 'benes', label: 'Medicare beneficiaries', format: 'count', counties: [], rollups: ROLLUPS }
      : { providers: [], availableStates: [], scope: { state: 'PA', label: '0 providers', sample_size: 0 }, counties: [], geography: { loaded: true, vintage: '2020' } }));
    renderAt('/TerritoryIntelligence?tab=density&state=PA&layer=benes', TerritoryIntelligence, '/TerritoryIntelligence');
    const picker = await screen.findByRole('combobox', { name: 'County layer' });
    expect(picker).toBeEnabled();
    expect(picker).toHaveTextContent('Medicare beneficiaries');
    expect(screen.queryByText('Pick a state to map market metrics by county.')).toBeNull();
  });
});

describe('CountyMetricLayer', () => {
  const layer = (n) => ({ label: 'Medicare beneficiaries', format: 'count', vintage: '2026-06', counties: Array.from({ length: n }, (_, i) => ({ fips: String(42001 + i * 2).padStart(5, '0'), name: `County ${i + 1}`, value: 1000 - i })), rollups: ROLLUPS });

  it('says it is loading, not that there are no profiles, while the layer loads', () => {
    render(<MemoryRouter><CountyMetricLayer layer={undefined} state="PA" loading /></MemoryRouter>);
    expect(screen.getByLabelText('Loading counties')).toBeInTheDocument();
    expect(screen.queryByText(/No county profiles/)).toBeNull();
  });

  it('shows the error and a retry, not an empty state, when the layer fails', () => {
    const retry = vi.fn();
    render(<MemoryRouter><CountyMetricLayer layer={undefined} state="PA" error={new Error('timeout')} onRetry={retry} /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load this county layer: timeout/);
    expect(screen.queryByText(/No county profiles/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('lists the top 30 counties and says so, with a way to see every county', () => {
    render(<MemoryRouter><CountyMetricLayer layer={layer(45)} state="PA" /></MemoryRouter>);
    expect(screen.getAllByRole('link')).toHaveLength(30);
    expect(screen.getByText('Top 30 of 45 counties')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all counties' }));
    expect(screen.getAllByRole('link')).toHaveLength(45);
    expect(screen.getByText('All 45 counties')).toBeInTheDocument();
  });

  it('carries the market disclaimer: the layer is a market view', () => {
    render(<MemoryRouter><CountyMetricLayer layer={layer(5)} state="PA" /></MemoryRouter>);
    expect(screen.getByRole('note')).toHaveTextContent(/Hospital sources show where/);
    expect(screen.getByRole('note')).toHaveTextContent(/not confirmed referrals/);
  });

  it('has no "show all" control when every county already fits', () => {
    render(<MemoryRouter><CountyMetricLayer layer={layer(12)} state="PA" /></MemoryRouter>);
    expect(screen.getAllByRole('link')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });
});

describe('PacCompetitorsTable licensed homes', () => {
  const home = (i) => ({ license_type: 'personal_care_home', license_number: `PCH-${i}`, name: `Home ${i}`, address: '1 Main St', city: 'Pittsburgh', zip5: '15213', capacity: 100 - i, status: 'Regular', licensee: 'Sunny Hill LLC' });
  const licensed = (rows, totals) => ({ as_of: '2026-09-30', rows: Array.from({ length: rows }, (_, i) => home(i)), totals });

  it("counts the county's homes from the totals, not the rows listed (the list is capped), and says so", () => {
    render(<MemoryRouter><PacCompetitorsTable licensed={licensed(50, [{ license_type: 'personal_care_home', homes: 120, beds: 5200 }, { license_type: 'assisted_living', homes: 30, beds: 1900 }])} countyName="Allegheny County" /></MemoryRouter>);
    // No CMS rows in this county, so the licensed homes are what opens.
    expect(screen.getByRole('button', { name: 'Personal care / assisted living (150)', pressed: true })).toBeInTheDocument();
    expect(screen.getByText('Showing the 50 largest of 150 licensed homes in Allegheny County; the counts above cover all of them.')).toBeInTheDocument();
    expect(screen.getByText('Personal care home: 120 homes · 5,200 beds')).toBeInTheDocument();
  });

  it('says nothing about a capped list when every home is listed', () => {
    render(<MemoryRouter><PacCompetitorsTable licensed={licensed(12, [{ license_type: 'personal_care_home', homes: 12, beds: 600 }])} countyName="Butler County" /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Personal care / assisted living (12)' })).toBeInTheDocument();
    expect(screen.queryByText(/Showing the/)).toBeNull();
  });
});

describe('market cards on a facility page', () => {
  function wrap(ui) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
  }

  it('MarketPositionCard shows county tiles only when the provider has a county, and carries the market disclaimer', async () => {
    invoke.mockReset().mockResolvedValue({
      found: true, label: 'Skilled nursing', data_year: '2024', county: { fips: '42003', name: 'Allegheny County', state: 'PA' },
      position: { rank: 2, providers_in_market: 70, share: 0.12, benes: 900, stays: 1200, state_rank: 15, state_providers: 680 },
      market: [], trend: [], coverage: [], rollups: ROLLUPS,
    });
    wrap(<MarketPositionCard ccn="395001" setting="snf" />);
    expect(await screen.findByText('county share')).toBeInTheDocument();
    expect(screen.getByText('of 70 in county')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/not confirmed referrals/);
    expect(screen.getByRole('note')).toHaveTextContent(/discharge mix/);
  });

  it('MarketPositionCard labels nothing "county" for a provider without a county', async () => {
    invoke.mockReset().mockResolvedValue({
      found: true, label: 'Skilled nursing', data_year: '2024', county: null,
      position: { rank: null, providers_in_market: null, share: null, benes: 900, stays: 1200, state_rank: 15, state_providers: 680 },
      market: [], trend: [], coverage: [], rollups: ROLLUPS,
    });
    wrap(<MarketPositionCard ccn="395001" setting="snf" />);
    expect(await screen.findByText(/no county in the post-acute file/)).toBeInTheDocument();
    expect(screen.queryByText('county share')).toBeNull();
    expect(screen.queryByText(/in county/)).toBeNull();
    expect(screen.getByText('of 680 in state')).toBeInTheDocument();
  });

  it('HospitalCatchmentCard carries the market disclaimer', async () => {
    invoke.mockReset().mockResolvedValue({
      ccn: '390001', data_year: '2025', total_cases: 1000, counties: [{ county_fips: '42003', name: 'Allegheny County', state: 'PA', cases: 900, share: 0.9 }], zips: [],
      discharge_mix: null, rollups: ROLLUPS,
    });
    wrap(<HospitalCatchmentCard ccn="390001" />);
    expect(await screen.findByText(/Where this hospital's patients live/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/discharge mix/);
  });

  it('HospitalCatchmentCard says the request failed, with a retry, instead of vanishing like a hospital with no data', async () => {
    invoke.mockReset().mockRejectedValueOnce(new Error('statement timeout')).mockResolvedValue({
      ccn: '390001', data_year: '2025', total_cases: 1000, counties: [{ county_fips: '42003', name: 'Allegheny County', state: 'PA', cases: 900, share: 0.9 }], zips: [], discharge_mix: null, rollups: ROLLUPS,
    });
    wrap(<HospitalCatchmentCard ccn="390001" />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load where this hospital's patients live: statement timeout");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Where this hospital's patients live/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('HospitalCatchmentCard ZIP areas', () => {
    const zips = (n) => Array.from({ length: n }, (_, i) => ({ zip5: String(15200 + i), county_fips: '42003', county_name: 'Allegheny County', cases: 500 - i, share: (500 - i) / 10000 }));
    const catchment = (n, extra = {}) => ({
      ccn: '390001', data_year: '2025', total_cases: 10000, zips_total: n, zips_truncated: false, zips: zips(n), counties: [{ county_fips: '42003', name: 'Allegheny County', state: 'PA', cases: 9000, share: 0.9 }],
      discharge_mix: null, rollups: ROLLUPS, ...extra,
    });

    it('lists the busiest ZIP areas, ten at first, with a control that shows the rest', async () => {
      invoke.mockReset().mockResolvedValue(catchment(25));
      wrap(<HospitalCatchmentCard ccn="390001" />);
      const list = await screen.findByRole('list', { name: "ZIP areas where this hospital's patients live" });
      expect(within(list).getAllByRole('listitem')).toHaveLength(10);
      expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('15200');
      expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Allegheny County');
      expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('500 (5%)');
      const more = screen.getByRole('button', { name: 'Show all 25 ZIP areas' });
      expect(more).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(more);
      expect(within(list).getAllByRole('listitem')).toHaveLength(25);
      expect(screen.getByRole('button', { name: 'Show fewer ZIP areas' })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.queryByText(/Showing the busiest/)).toBeNull();
    });

    it('says when the server sent only the busiest of the hospital’s ZIP areas', async () => {
      invoke.mockReset().mockResolvedValue(catchment(300, { zips_total: 812, zips_truncated: true }));
      wrap(<HospitalCatchmentCard ccn="390001" />);
      expect(await screen.findByText(/Showing the busiest 300 of 812 ZIP areas; the totals and the county split count all of them\./)).toBeInTheDocument();
    });

    it('has no ZIP list, and no toggle, for a short list or none', async () => {
      invoke.mockReset().mockResolvedValue(catchment(4));
      wrap(<HospitalCatchmentCard ccn="390001" />);
      const list = await screen.findByRole('list', { name: "ZIP areas where this hospital's patients live" });
      expect(within(list).getAllByRole('listitem')).toHaveLength(4);
      expect(screen.queryByRole('button', { name: /ZIP areas/ })).toBeNull();
      cleanup();
      invoke.mockReset().mockResolvedValue(catchment(0));
      wrap(<HospitalCatchmentCard ccn="390001" />);
      await screen.findByText(/Where this hospital's patients live/);
      expect(screen.queryByRole('list', { name: "ZIP areas where this hospital's patients live" })).toBeNull();
    });
  });

  it('MarketPositionCard says the request failed, with a retry, instead of vanishing like a provider with no market data', async () => {
    invoke.mockReset().mockRejectedValueOnce(new Error('connection terminated')).mockResolvedValue({
      found: true, label: 'Skilled nursing', data_year: '2024', county: { fips: '42003', name: 'Allegheny County', state: 'PA' },
      position: { rank: 2, providers_in_market: 70, share: 0.12, benes: 900, stays: 1200, state_rank: 15, state_providers: 680, state_share: 0.011 },
      market: [], trend: [], coverage: [], rollups: ROLLUPS,
    });
    wrap(<MarketPositionCard ccn="395001" setting="snf" />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this provider's market position: connection terminated");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('county share')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('MarketPositionCard shows the state share beside the state rank', async () => {
    invoke.mockReset().mockResolvedValue({
      found: true, label: 'Skilled nursing', data_year: '2024', county: { fips: '42003', name: 'Allegheny County', state: 'PA' },
      position: { rank: 2, providers_in_market: 70, share: 0.12, benes: 900, stays: 1200, state_rank: 15, state_providers: 680, state_share: 0.011 },
      market: [], trend: [], coverage: [], rollups: ROLLUPS,
    });
    wrap(<MarketPositionCard ccn="395001" setting="snf" />);
    const tile = (await screen.findByText('state share')).closest('div');
    expect(tile).toHaveTextContent('1.1%');
    expect(screen.getByText('of 680 in state')).toBeInTheDocument();
    expect(screen.getByText('county share').closest('div')).toHaveTextContent('12.0%');
  });
});

describe('cards', () => {
  it('renders a clinician’s referral potential, and nothing without data', () => {
    const { container } = render(<ReferralPotentialCard potential={null} />);
    expect(container).toBeEmptyDOMElement();
    render(<ReferralPotentialCard potential={{ data_year: '2024', referral_index: 96, rank_in_county: 1, county_name: 'Allegheny County', benes: 620, services: 8000, avg_risk_score: 2.1, dual_pct: 0.3, hospital_ccns: ['390001'], affiliations: 2, dme_benes: 40, hha_eligible: true, hospice_eligible: true, dme_eligible: false, cc_alzheimer_pct: 0.12, cc_chf_pct: 0.2 }} />);
    expect(screen.getByText('96')).toBeInTheDocument();
    expect(screen.getByText('1st in Allegheny County')).toBeInTheDocument();
    expect(screen.getByText('Home health eligible')).toBeInTheDocument();
    expect(screen.getByText('DME not eligible')).toBeInTheDocument();
    expect(screen.getByText('Alzheimer’s / dementia')).toBeInTheDocument();
  });

  it('shows "Not loaded" rather than 0 hospital affiliations while the Facility Affiliation file has not been imported', () => {
    const base = { data_year: '2024', referral_index: 96, rank_in_county: 1, county_name: 'Allegheny County', benes: 620, hospital_ccns: [], affiliations: null };
    const hospitals = () => screen.getByText('Hospital affiliations').nextElementSibling;
    const { rerender } = render(<ReferralPotentialCard potential={base} />);
    expect(hospitals()).toHaveTextContent('Not loaded');
    rerender(<ReferralPotentialCard potential={{ ...base, affiliations: 0 }} />);
    expect(hospitals()).toHaveTextContent(/^0$/);
    // Three affiliations on file, two of them hospitals.
    rerender(<ReferralPotentialCard potential={{ ...base, hospital_ccns: ['390001', '390002'], affiliations: 3 }} />);
    expect(hospitals()).toHaveTextContent(/^2$/);
  });

  it('shows the patients a clinician certified for home health: a count, "10 or fewer" when CMS does not list them, "Not loaded" before the file', () => {
    const base = { data_year: '2024', referral_index: 96, rank_in_county: 1, county_name: 'Allegheny County', benes: 620, hospital_ccns: [], affiliations: 0 };
    const certified = () => screen.getByText('Certified for home health').nextElementSibling;
    const { rerender } = render(<ReferralPotentialCard potential={base} />);
    expect(certified()).toHaveTextContent('Not loaded');
    expect(screen.queryByText(/added up over the care settings/)).toBeNull();
    rerender(<ReferralPotentialCard potential={{ ...base, hh_cert_benes: 43 }} />);
    expect(certified()).toHaveTextContent(/^43 patients$/);
    expect(screen.getByText(/^Patients certified for home health, Medicare volume/)).toBeInTheDocument();
    // The counts are added up over the care settings, which the card says.
    expect(screen.getByText(/Certified patients are added up over the care settings CMS lists separately, so a patient certified in two settings counts in both\. CMS lists a setting only above 10 patients\./)).toBeInTheDocument();
    rerender(<ReferralPotentialCard potential={{ ...base, hh_cert_benes: 0 }} />);
    expect(certified()).toHaveTextContent(/^10 or fewer$/);
  });

  it('puts the certification file\'s own year on the count, not the physician file\'s year in the badge', () => {
    // The two annual files can be on different releases: the badge says 2024, the certifications are 2023's.
    const base = { data_year: '2024', referral_index: 96, rank_in_county: 1, county_name: 'Allegheny County', benes: 620, hospital_ccns: [], affiliations: 0, hh_cert_year: '2023' };
    const certified = () => screen.getByText('Certified for home health').nextElementSibling;
    const { rerender } = render(<ReferralPotentialCard potential={{ ...base, hh_cert_benes: 43 }} />);
    expect(screen.getByText('data year 2024')).toBeInTheDocument();
    expect(certified()).toHaveTextContent(/^43 patients \(2023\)$/);
    rerender(<ReferralPotentialCard potential={{ ...base, hh_cert_benes: 0 }} />);
    expect(certified()).toHaveTextContent(/^10 or fewer \(2023\)$/);
    // Before the file is imported there is no year to show.
    rerender(<ReferralPotentialCard potential={{ ...base, hh_cert_benes: null, hh_cert_year: null }} />);
    expect(certified()).toHaveTextContent(/^Not loaded$/);
  });

  it('carries the market disclaimer and says when the referral rollup last computed', () => {
    const potential = { data_year: '2024', referral_index: 96, rank_in_county: 1, county_name: 'Allegheny County', benes: 620, hospital_ccns: [], affiliations: 0 };
    const rollups = { referral_sources: { status: 'success', refreshed_at: '2026-10-10T03:00:00Z', error: null } };
    render(<ReferralPotentialCard potential={potential} rollups={rollups} />);
    expect(screen.getByRole('note')).toHaveTextContent(/not confirmed referrals/);
    expect(screen.getByRole('note')).toHaveTextContent(/discharge mix/);
    expect(screen.getByText(/Computed /)).toBeInTheDocument();
  });

  it('says a failed refresh of the referral rollup on the card', () => {
    const potential = { data_year: '2024', referral_index: 96, benes: 620, hospital_ccns: [], affiliations: 0 };
    render(<ReferralPotentialCard potential={potential} rollups={{ referral_sources: { status: 'failed', refreshed_at: null, error: 'out of memory' } }} />);
    expect(screen.getByText(/Last refresh failed: out of memory/)).toBeInTheDocument();
  });

  it('renders the compliance note', () => {
    render(<ComplianceDisclaimer />);
    expect(screen.getByRole('note')).toHaveTextContent(/not confirmed referrals/);
    expect(screen.getByRole('note')).not.toHaveTextContent(/discharge mix/);
  });
});

describe('CountyMarketProfile tiles', () => {
  const profile = (extra = {}) => ({ available: true, benes: 310000, original_medicare: 118000, ma_penetration: 0.62, benes_85_plus: 21700, dual: 40000, enrollment_period: '2026-06', ...extra });
  const tile = (label) => screen.getByText(label).closest('div').parentElement;

  it('puts the dual-eligible count with all beneficiaries, not under the 85-and-over tile it is not about', () => {
    render(<CountyMarketProfile profile={profile()} />);
    expect(within(tile('Medicare beneficiaries')).getByText('Enrollment 2026-06 · 40,000 dual-eligible')).toBeInTheDocument();
    expect(within(tile('Aged 85 and over')).getByText('7.0% of beneficiaries')).toBeInTheDocument();
    expect(screen.queryByText('40,000 dual-eligible')).toBeNull();
  });

  it('says nothing under a tile it has nothing to say for', () => {
    render(<CountyMarketProfile profile={profile({ dual: null, enrollment_period: null, benes_85_plus: null })} />);
    expect(within(tile('Medicare beneficiaries')).queryByText(/dual-eligible|Enrollment/)).toBeNull();
    expect(within(tile('Aged 85 and over')).queryByText(/of beneficiaries/)).toBeNull();
  });

  it('shows the average HCC risk score when the county has one, and no empty tile when it does not', () => {
    const { unmount } = render(<CountyMarketProfile profile={profile({ avg_hcc_score: 1.12 })} />);
    expect(screen.getByText('Average HCC risk score')).toBeInTheDocument();
    unmount();
    render(<CountyMarketProfile profile={profile({ avg_hcc_score: null })} />);
    expect(screen.queryByText('Average HCC risk score')).toBeNull();
  });
});

describe('FacilitySummaryCard', () => {
  const data = { by_type: { nursing_home_providers: [{}] }, data_years: [2026] };

  it('leaves out the inpatient figures a facility does not have, instead of showing them as zero', () => {
    render(<FacilitySummaryCard data={data} financials={{ totalPayments: 0, totalCharges: 0, totalDischarges: 0, totalDaysOfCare: 0 }} facilityTypes={['nursing_home_providers']} />);
    for (const label of ['Total Payments', 'Total Charges', 'Discharges', 'Days of Care']) expect(screen.queryByText(label)).toBeNull();
    expect(screen.getByText('Data Sources')).toBeInTheDocument();
    expect(screen.getByText('2026–2026')).toBeInTheDocument();
  });

  it('shows them when any of them has a value', () => {
    render(<FacilitySummaryCard data={data} financials={{ totalPayments: 5e6, totalCharges: 0, totalDischarges: 1200, totalDaysOfCare: 0 }} facilityTypes={['hospital_general_info']} />);
    for (const label of ['Total Payments', 'Total Charges', 'Discharges', 'Days of Care']) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
  });
});

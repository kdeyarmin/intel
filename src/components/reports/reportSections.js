import { createPageUrl } from '@/utils';
import { exportAttribution } from '@/components/exports/exportUtils';
import { pickPrimaryLocation } from '@/lib/locations';

/**
 * The parts of a comprehensive report a user can choose. Keys mirror
 * REPORT_SECTION_KEYS in server/functions/comprehensiveReport.ts, which skips
 * the queries behind the sections that weren't asked for. `needsNpi` sections
 * describe an NPI record, so a facility without a linked NPI doesn't offer them.
 */
export const REPORT_SECTIONS = [
  { key: 'profile', label: 'Profile & overview', description: 'Identity, contact details and headline Medicare totals', needsNpi: false },
  { key: 'locations', label: 'Locations', description: 'Practice and mailing addresses (NPPES)', needsNpi: true },
  { key: 'taxonomies', label: 'Taxonomies', description: 'Specialties and licenses (NUCC codes)', needsNpi: true },
  { key: 'utilization', label: 'Service utilization', description: 'Available Medicare services, facility activity, beneficiaries and payments', needsNpi: false },
  { key: 'referrals', label: 'Referrals (sent & received)', description: 'Shared-patient partners and ordering eligibility', needsNpi: true },
  { key: 'affiliations', label: 'Affiliations', description: 'Organizations this provider is affiliated with', needsNpi: true },
  { key: 'facilities', label: 'Linked facilities', description: 'Medicare facility records under this CCN or NPI', needsNpi: false },
  { key: 'quality', label: 'Quality measures', description: 'Latest CMS star ratings by dataset', needsNpi: false },
  { key: 'ownership', label: 'Ownership details', description: 'Reported owners, ownership percentages, types and roles where linked by CCN, NPI or enrollment', needsNpi: false, source: 'CMS All Owners and Nursing Home Ownership files' },
  { key: 'costReports', label: 'Cost report summaries', description: 'Latest reported revenue, expenses, beds and visits; only available metrics are shown', needsNpi: false, source: 'CMS Hospital, Home Health Agency and SNF Cost Reports' },
  { key: 'additionalQuality', label: 'Additional quality measures', description: 'A curated snapshot of reported performance scores and quality measures beyond star ratings', needsNpi: false, source: 'CMS Value-Based Purchasing, SNF Quality Reporting, Home Health and Nursing Home quality files' },
  { key: 'market', label: 'Market context', description: 'County Medicare demand, population and post-acute supply where geography and rollups are available', needsNpi: false, source: 'CMS and U.S. Census county market rollups' },
  { key: 'leadScore', label: 'Lead score', description: 'CareMetric lead score and its components', needsNpi: true },
  { key: 'enrichments', label: 'Enrichments', description: 'Contact and profile enrichment records', needsNpi: true },
];

const SECTION_SOURCES = {
  profile: 'NPPES National Provider Registry',
  locations: 'NPPES National Provider Registry',
  taxonomies: 'NPPES / NUCC Health Care Provider Taxonomy',
  utilization: 'CMS Medicare Physician & Other Practitioners (by provider and service)',
  referrals: 'CMS physician shared-patient patterns; CMS Order and Referring file',
  affiliations: 'CMS facility affiliations and NPPES',
  facilities: 'CMS Provider of Services and Care Compare facility files',
  quality: 'CMS Care Compare star ratings',
  leadScore: 'CareMetric lead scoring',
  enrichments: 'CareMetric enrichment records',
};

/** The sections that apply to a report about this NPI and/or CCN. */
export function availableSections({ npi, providerId } = {}) {
  if (!npi && !providerId) return [];
  return REPORT_SECTIONS.filter((s) => !s.needsNpi || !!npi);
}

/** Report sections in catalog order, keeping only known and available keys. */
export function orderedSelection(selected, available = REPORT_SECTIONS) {
  const set = new Set(selected || []);
  return available.filter((s) => set.has(s.key)).map((s) => s.key);
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function fmtInt(v) {
  const n = num(v);
  return n == null ? '—' : Math.round(n).toLocaleString('en-US');
}

export function fmtMoney(v) {
  const n = num(v);
  return n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function fmtMoneyCompact(v) {
  const n = num(v);
  if (n == null) return '—';
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return fmtMoney(n);
}

const text = (v) => (v == null || v === '' ? '—' : String(v));
const identifier = (v) => text(v).replace(/,/g, '');
const zip5 = (v) => v == null || v === '' ? null : identifier(v).slice(0, 5).padStart(5, '0');
const fmtMetric = (v, format) => {
  const n = num(v);
  if (n == null) return '—';
  if (format === 'money') return fmtMoney(n);
  if (format === 'percent') return `${(n * 100).toFixed(1)}%`;
  if (format === 'pct_units') return `${n.toFixed(1)}%`;
  if (format === 'number' || format === 'decimal' || format === 'rate') return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return fmtInt(n);
};
export const blockHasData = (block) => block.kind === 'table' ? block.rows.length > 0 : block.items.length > 0;
const yesNo = (v) => {
  if (v == null || v === '') return '—';
  return v === true || /^(y|yes|true|1)$/i.test(String(v)) ? 'Yes' : 'No';
};
const ACRONYMS = /\b(snf|hha|irf|ltch|dme|hcahps|hhcahps|asc|hac|drg|ma|cbsa|npi|ccn)\b/gi;
const humanize = (s) => {
  const t = String(s || '').replace(/^cms_pac_utilization:/, 'Post-acute utilization: ').replace(/_/g, ' ').trim().replace(ACRONYMS, (m) => m.toUpperCase());
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—';
};
const providerLink = (npi) => (npi ? createPageUrl('ProviderDetail') + `?npi=${encodeURIComponent(npi)}` : undefined);

const col = (key, label, align = 'left') => ({ key, label, align });

function table(key, title, columns, rows, emptyText) {
  return { key, title, kind: 'table', columns, rows, count: rows.length, emptyText };
}

function sectionBlocks(key, report) {
  switch (key) {
    case 'locations': {
      const rows = (report.locations || []).map((l) => ({
        address: { text: [l.address_1, l.address_2].filter(Boolean).join(', ') || '—' },
        place: { text: [l.city, l.state, zip5(l.zip)].filter(Boolean).join(', ') || '—' },
        type: { text: text(l.location_type) },
        phone: { text: text(l.phone) },
      }));
      return [table('locations', 'Locations', [col('address', 'Address'), col('place', 'City, State ZIP'), col('type', 'Type'), col('phone', 'Phone')], rows, 'No addresses on file.')];
    }
    case 'taxonomies': {
      const rows = (report.taxonomies || []).map((t) => ({
        description: { text: t.taxonomy_description || t.classification || t.taxonomy_code || '—' },
        code: { text: text(t.taxonomy_code) },
        license: { text: [t.license_number, t.license_state].filter(Boolean).join(' · ') || '—' },
        primary: { text: t.is_primary ? 'Primary' : '' },
      }));
      return [table('taxonomies', 'Taxonomies', [col('description', 'Specialty'), col('code', 'Code'), col('license', 'License'), col('primary', 'Primary')], rows, 'No taxonomies on file.')];
    }
    case 'utilization': {
      const rows = (report.utilization || []).map((u) => ({
        service: { text: u.serviceType || u.hcpcsDescription || '—' },
        year: { text: identifier(u.dataYear) },
        services: { text: fmtInt(u.totalServices) },
        benes: { text: fmtInt(u.totalBeneficiaries) },
        payment: { text: fmtMoney(u.totalPayment) },
      }));
      const facilityRows = (report.facilityUtilization || []).map((u) => ({
        dataset: { text: humanize(u.dataset) },
        year: { text: identifier(u.dataYear) },
        metric: { text: text(u.metric) },
        value: { text: fmtMetric(u.value, u.format) },
      }));
      const blocks = [];
      if (facilityRows.length) blocks.push({
        ...table('facilityUtilization', 'Facility Utilization', [col('dataset', 'Dataset'), col('year', 'Year', 'right'), col('metric', 'Measure'), col('value', 'Reported value', 'right')], facilityRows),
        note: 'Latest available period per dataset. Facility totals and clinician services describe different populations and are not combined.',
      });
      if (report.provider || rows.length || !facilityRows.length) blocks.push({
        ...table('utilization', 'Service Utilization', [col('service', 'Service'), col('year', 'Year', 'right'), col('services', 'Services', 'right'), col('benes', 'Beneficiaries', 'right'), col('payment', 'Medicare paid', 'right')], rows, 'No linked Medicare utilization is available for this report.'),
        note: 'Up to 100 service records. Beneficiary counts across service codes can overlap and are not unique patients.',
      });
      return blocks;
    }
    case 'referrals': {
      const sent = (report.referralsFrom || []).map((r) => ({
        partner: { text: r.toName || r.toNpi || '—' },
        npi: { text: identifier(r.toNpi), to: providerLink(r.toNpi) },
        referrals: { text: fmtInt(r.totalReferrals) },
        benes: { text: fmtInt(r.totalBeneficiaries) },
        year: { text: identifier(r.dataYear) },
      }));
      const received = (report.referralsTo || []).map((r) => ({
        partner: { text: r.fromName || r.fromNpi || '—' },
        npi: { text: identifier(r.fromNpi), to: providerLink(r.fromNpi) },
        referrals: { text: fmtInt(r.totalReferrals) },
        benes: { text: fmtInt(r.totalBeneficiaries) },
        year: { text: identifier(r.dataYear) },
      }));
      const cols = [col('partner', 'Partner'), col('npi', 'NPI'), col('referrals', 'Shared patients', 'right'), col('benes', 'Beneficiaries', 'right'), col('year', 'Year', 'right')];
      const blocks = [
        table('referralsSent', 'Referrals Sent', cols, sent, 'No outbound shared-patient partners on file.'),
        table('referralsReceived', 'Referrals Received', cols, received, 'No inbound shared-patient partners on file.'),
      ];
      blocks[0].note = blocks[1].note = 'Up to 50 partners per direction. Shared-patient patterns indicate relationships, not confirmed referral orders; counts can overlap.';
      const o = report.orderReferring;
      if (o) {
        blocks.push({
          key: 'orderReferring',
          title: 'Medicare Ordering & Referring Eligibility',
          kind: 'kv',
          items: [
            { label: 'Part B', value: yesNo(o.partb) },
            { label: 'DME', value: yesNo(o.dme) },
            { label: 'Home health', value: yesNo(o.hha) },
            { label: 'Power mobility', value: yesNo(o.pmd) },
            { label: 'Hospice', value: yesNo(o.hospice) },
          ],
          note: 'Enrollment to order or refer, not a count of orders.',
        });
      }
      return blocks;
    }
    case 'affiliations': {
      const rows = (report.affiliations || []).map((a) => ({
        org: { text: a.organization_name || a.organization_npi || '—' },
        npi: { text: identifier(a.organization_npi), to: providerLink(a.organization_npi) },
        type: { text: text(a.affiliation_type) },
        place: { text: [a.city, a.state].filter(Boolean).join(', ') || '—' },
      }));
      return [table('affiliations', 'Affiliations', [col('org', 'Organization'), col('npi', 'NPI'), col('type', 'Type'), col('place', 'Location')], rows, 'No affiliations on file.')];
    }
    case 'facilities': {
      const rows = (report.facilities || []).map((f) => ({
        name: { text: f.name || '—', to: f.providerId ? createPageUrl('FacilityDetail') + `?id=${encodeURIComponent(f.providerId)}&group=${encodeURIComponent(f.facilityType || '')}` : undefined },
        dataset: { text: humanize(f.facilityType) },
        place: { text: [f.city, f.state].filter(Boolean).join(', ') || '—' },
        year: { text: identifier(f.dataYear) },
        payments: { text: f.totalPayments == null ? '—' : fmtMoney(f.totalPayments) },
      }));
      return [table('facilities', 'Linked Facilities', [col('name', 'Facility'), col('dataset', 'Dataset'), col('place', 'Location'), col('year', 'Year', 'right'), col('payments', 'Payments', 'right')], rows, 'No Medicare facility records linked.')];
    }
    case 'quality': {
      const rows = (report.quality || []).map((q) => ({
        dataset: { text: humanize(q.facilityType) },
        facility: { text: text(q.name) },
        rating: { text: num(q.qualityRating) == null ? '—' : `${num(q.qualityRating)} / 5` },
        year: { text: identifier(q.dataYear) },
      }));
      return [table('quality', 'Quality Measures', [col('dataset', 'Dataset'), col('facility', 'Facility'), col('rating', 'Star rating', 'right'), col('year', 'Year', 'right')], rows, 'No CMS quality ratings on file.')];
    }
    case 'ownership': {
      const rows = (report.ownership || []).map((o) => ({
        owner: { text: text(o.ownerName) },
        percentage: { text: num(o.percentage) == null ? '—' : `${num(o.percentage)}%` },
        type: { text: [o.ownerType, o.role].filter(Boolean).join(' · ') || '—' },
        dataset: { text: humanize(o.dataset) },
        year: { text: identifier(o.dataYear) },
      }));
      return [{
        ...table('ownership', 'Ownership Details', [col('owner', 'Owner'), col('percentage', 'Ownership', 'right'), col('type', 'Type / role'), col('dataset', 'Dataset'), col('year', 'Year', 'right')], rows, 'No linked ownership details on file.'),
        note: 'Up to 30 reported ownership or management interests. Missing percentages are not zero; interests may overlap and are not summed.',
      }];
    }
    case 'costReports': {
      const rows = (report.costReports || []).map((c) => ({
        dataset: { text: humanize(c.dataset) },
        period: { text: c.period || identifier(c.dataYear) },
        metric: { text: text(c.metric) },
        value: { text: c.format === 'money' ? fmtMoney(c.value) : fmtInt(c.value) },
      }));
      return [{
        ...table('costReports', 'Cost Report Summaries', [col('dataset', 'Dataset'), col('period', 'Reporting period'), col('metric', 'Metric'), col('value', 'Reported value', 'right')], rows, 'No linked cost report metrics on file.'),
        note: 'Latest available release per dataset. Fiscal periods may differ; reported financial totals are not combined.',
      }];
    }
    case 'additionalQuality': {
      const rows = (report.additionalQuality || []).map((q) => ({
        dataset: { text: humanize(q.dataset) },
        measure: { text: text(q.metric) },
        score: { text: text(q.value) },
        year: { text: identifier(q.dataYear) },
      }));
      return [{
        ...table('additionalQuality', 'Additional Quality Measures', [col('dataset', 'Dataset'), col('measure', 'Measure'), col('score', 'Reported score', 'right'), col('year', 'Year', 'right')], rows, 'No additional linked quality measures on file.'),
        note: 'Up to five measures per record, 20 overall. CMS scores retain their source units; measures and reporting periods are not directly comparable. Suppressed or unavailable scores are omitted.',
      }];
    }
    case 'market': {
      const m = report.marketContext;
      const rows = (m?.metrics || []).map((it) => ({
        metric: { text: it.label },
        value: { text: fmtMetric(it.value, it.format) },
        year: { text: identifier(it.dataYear) },
      }));
      return [{
        ...table('market', m ? `Market Context — ${m.countyName}, ${m.state}` : 'Market Context', [col('metric', 'County measure'), col('value', 'Reported value', 'right'), col('year', 'Source year', 'right')], rows,
          'County market context is unavailable: a reliable county match or published market rollup was not available.'),
        note: `County figures describe the surrounding market, not this facility's patients or referral volume. ZIP areas may cross county boundaries. Reporting periods vary by source.${m?.refreshedAt ? ` Rollup refreshed ${String(m.refreshedAt).slice(0, 10)}.` : ''}`,
      }];
    }
    case 'leadScore': {
      const s = report.leadScore;
      const score = num(s?.score);
      return [{
        key: 'leadScore',
        title: 'Lead Score',
        kind: 'kv',
        // Scores are never invented: no lead_scores row reads "Unscored".
        items: s ? [
          { label: 'Lead score', value: score == null ? 'Unscored' : String(Math.round(score)), emphasis: true },
          { label: 'Outreach potential', value: num(s.outreach_potential) == null ? '—' : String(Math.round(num(s.outreach_potential))) },
          { label: 'Referral likelihood', value: num(s.referral_likelihood) == null ? '—' : String(Math.round(num(s.referral_likelihood))) },
          { label: 'Data completeness', value: num(s.data_completeness) == null ? '—' : String(Math.round(num(s.data_completeness))) },
        ] : [],
        emptyText: 'Unscored: no lead score has been calculated for this provider.',
      }];
    }
    case 'enrichments': {
      const rows = (report.enrichments || []).map((e) => ({
        field: { text: text(e.fieldName) },
        value: { text: text(e.newValue) },
        source: { text: text(e.source) },
        confidence: { text: text(e.confidence) },
        status: { text: text(e.status) },
      }));
      return [table('enrichments', 'Enrichment Records', [col('field', 'Field'), col('value', 'Value'), col('source', 'Source'), col('confidence', 'Confidence'), col('status', 'Status')], rows, 'No enrichment records.')];
    }
    default:
      return [];
  }
}

function profileOf(report, { npi, providerId }) {
  const p = report.provider;
  const f = report.facility;
  const identifiers = [];
  if (f) {
    identifiers.push({ label: 'CCN', value: identifier(f.providerId || providerId) });
    if (f.address) identifiers.push({ label: 'Address', value: f.address });
    if (f.city || f.state || f.zip) identifiers.push({ label: 'Location', value: [f.city, f.state, zip5(f.zip)].filter(Boolean).join(', ') });
    if (f.phone) identifiers.push({ label: 'Facility phone', value: f.phone });
    if (f.ownershipType) identifiers.push({ label: 'Ownership type', value: f.ownershipType });
    if (num(f.beds) != null) identifiers.push({ label: 'Reported beds', value: fmtInt(f.beds) });
    if (f.facilityTypes?.length) identifiers.push({ label: 'CMS datasets', value: f.facilityTypes.map(humanize).join(', ') });
    if (f.latestYear) identifiers.push({ label: 'Latest data year', value: identifier(f.latestYear) });
  } else if (providerId) {
    identifiers.push({ label: 'CCN', value: identifier(providerId) });
  }
  if (p) {
    identifiers.push({ label: f ? 'Linked NPI' : 'NPI', value: identifier(p.npi) });
    identifiers.push({ label: 'Entity type', value: p.entityType === '2' || /organ/i.test(String(p.entityType || '')) ? 'Organization' : 'Individual' });
    if (p.credential) identifiers.push({ label: 'Credential', value: p.credential });
    if (p.status) identifiers.push({ label: 'NPI status', value: humanize(p.status) });
    if (p.phone) identifiers.push({ label: 'Phone', value: p.phone });
    if (p.email) identifiers.push({ label: 'Email', value: p.email });
  } else if (npi && !f) {
    identifiers.push({ label: 'NPI', value: identifier(npi) });
  }
  const location = pickPrimaryLocation(report.locations || []);
  if (!f && location) {
    identifiers.push({ label: 'Practice address', value: [location.address_1, location.address_2, location.city, location.state, zip5(location.zip)].filter(Boolean).join(', ') });
  }
  const specialty = (report.taxonomies || []).find((t) => t.is_primary) || report.taxonomies?.[0];
  if (specialty) identifiers.push({ label: 'Specialty', value: specialty.taxonomy_description || specialty.taxonomy_code });

  const s = report.summary || {};
  const year = s.utilizationYears?.[0];
  // Medicare totals describe the NPI; a facility without one shows none rather than zeros.
  const facilityMetrics = (report.facilityUtilization || []).filter((m) => num(m.value) != null).slice(0, 4).map((m) => ({
    label: `${m.metric} — ${humanize(m.dataset)}${m.dataYear ? ` (${identifier(m.dataYear)})` : ''}`,
    value: fmtMetric(m.value, m.format), tone: 'cyan',
  }));
  const metrics = providerId ? facilityMetrics : p && year ? [
    { label: `Medicare paid (${identifier(year)})`, raw: s.totalPayments, format: fmtMoneyCompact, tone: 'amber' },
    { label: `Services (${identifier(year)})`, raw: s.totalServices, format: fmtInt, tone: 'cyan' },
    { label: `Beneficiary counts (${identifier(year)})`, raw: s.totalBeneficiaries, format: fmtInt, tone: 'emerald' },
  ].filter((m) => num(m.raw) != null).map((m) => ({ label: m.label, value: m.format(m.raw), tone: m.tone })) : [];
  const highlights = [];
  if (report.quality?.length) {
    const q = report.quality[0];
    highlights.push(`CMS star rating: ${q.qualityRating} of 5 (${humanize(q.facilityType)}, ${identifier(q.dataYear)}).`);
  }
  if (report.ownership?.length) {
    const o = report.ownership[0];
    highlights.push(`Reported ownership / management interest: ${o.ownerName}${num(o.percentage) != null ? ` (${num(o.percentage)}%)` : ''}. Verify the current decision-maker before outreach.`);
  }
  const revenue = (report.costReports || []).find((c) => c.metric === 'Total revenue');
  if (revenue) highlights.push(`Reported total revenue: ${fmtMoney(revenue.value)} (${revenue.period || identifier(revenue.dataYear)}). Financial and utilization reporting periods may differ.`);
  if (report.marketContext?.countyName) highlights.push(`Market area: ${report.marketContext.countyName}, ${report.marketContext.state}. County demand and supply figures are context, not facility performance.`);
  const partner = report.referralsFrom?.[0];
  if (partner) highlights.push(`Largest listed outbound shared-patient partner: ${partner.toName || identifier(partner.toNpi)} (${fmtInt(partner.totalReferrals)} shared-patient count, ${identifier(partner.dataYear)}). This is not a confirmed referral order count.`);
  if (!metrics.length) highlights.push('Headline Medicare activity is not available for this report; missing data should not be interpreted as zero activity.');
  if (!providerId && year) highlights.push('Medicare beneficiary counts are summed across service codes and may count a patient more than once.');
  return { identifiers, metrics, highlights };
}

/**
 * Turns a getComprehensiveReport payload into the document the screen, the
 * print layout and the PDF all render: a title block, the chosen sections in
 * catalog order, and the sources behind them.
 */
export function buildReportModel(report, selected, { npi, providerId, facilityName } = {}) {
  const r = report || {};
  const keys = orderedSelection(selected, availableSections({ npi: npi || r.provider?.npi, providerId }));
  const isFacility = !!providerId;
  const title = isFacility
    ? (r.facility?.name || facilityName || `CCN ${providerId}`)
    : (r.provider?.displayName || (npi ? `NPI ${npi}` : 'Report'));
  const generatedAt = r.generatedAt ? new Date(r.generatedAt) : new Date();

  const profile = keys.includes('profile') ? profileOf(r, { npi, providerId }) : null;
  const sections = keys.filter((k) => k !== 'profile').map((key) => ({
    key,
    label: REPORT_SECTIONS.find((s) => s.key === key)?.label || key,
    blocks: sectionBlocks(key, r),
  }));
  const unavailable = new Set(r.unavailableSections || []);
  const availability = sections.flatMap((section) => {
    if (unavailable.has(section.key)) return [{ label: section.label, message: 'This source could not be retrieved when the report was generated. Retry the report to verify coverage; any displayed records may be incomplete.' }];
    return section.blocks.filter((block) => !blockHasData(block)).map((block) => ({
      label: block.title, message: block.emptyText || 'No linked records are available in the data currently loaded.',
    }));
  });
  if (unavailable.has('profile')) availability.unshift({ label: 'Profile & overview', message: 'Some overview sources could not be retrieved. Available facts are shown; missing values are not zero.' });
  if (isFacility && !npi && !r.provider?.npi && keys.includes('profile')) availability.push({
    label: 'Provider referrals & contacts', message: 'No linked NPI was supplied. Clinician service lines, shared-patient partners and provider contact enrichment are not included.',
  });
  const sources = [...new Set(keys.map((k) => {
    if (k === 'profile' && isFacility) return 'CMS facility profiles and post-acute utilization';
    if (k === 'utilization' && isFacility) return 'CMS facility and Medicare post-acute utilization files';
    return SECTION_SOURCES[k] || REPORT_SECTIONS.find((s) => s.key === k)?.source;
  }).filter(Boolean))];

  return {
    title,
    subtitle: isFacility ? 'Facility Intelligence Report' : 'Provider Intelligence Report',
    generatedAt,
    generatedLabel: generatedAt.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }),
    selectedKeys: keys,
    profile,
    sections,
    availability,
    sources,
    attribution: exportAttribution(generatedAt),
  };
}

/** A safe file name for the report download. */
export function reportFileName(model) {
  const base = String(model?.title || 'report').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';
  return `CareMetric-${base}-${(model?.generatedAt || new Date()).toISOString().slice(0, 10)}`;
}

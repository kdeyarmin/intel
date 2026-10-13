import { createPageUrl } from '@/utils';
import { exportAttribution } from '@/components/exports/exportUtils';
import { isIdentifierField } from '@/components/exports/exportFormatting';

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
  { key: 'utilization', label: 'Service utilization', description: 'Medicare services, beneficiaries and payments', needsNpi: true },
  { key: 'referrals', label: 'Referrals (sent & received)', description: 'Shared-patient partners and ordering eligibility', needsNpi: true },
  { key: 'affiliations', label: 'Affiliations', description: 'Organizations this provider is affiliated with', needsNpi: true },
  { key: 'facilities', label: 'Linked facilities', description: 'Medicare facility records under this CCN or NPI', needsNpi: false },
  { key: 'quality', label: 'Quality measures', description: 'Latest CMS star ratings by dataset', needsNpi: false },
  { key: 'ownership', label: 'Ownership details', description: 'Reported owners, ownership percentages, types and roles where linked by CCN, NPI or enrollment', needsNpi: false, source: 'CMS All Owners and Nursing Home Ownership files' },
  { key: 'costReports', label: 'Cost report summaries', description: 'Latest reported revenue, expenses, beds and visits; only available metrics are shown', needsNpi: false, source: 'CMS Hospital, Home Health Agency and SNF Cost Reports' },
  { key: 'additionalQuality', label: 'Additional quality measures', description: 'A curated snapshot of reported performance scores and quality measures beyond star ratings', needsNpi: false, source: 'CMS Value-Based Purchasing, SNF Quality Reporting, Home Health and Nursing Home quality files' },
  { key: 'leadScore', label: 'Lead score', description: 'CareMetric Intel lead score and its components', needsNpi: true },
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
  leadScore: 'CareMetric Intel lead scoring',
  enrichments: 'CareMetric Intel enrichment records',
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
const yesNo = (v) => {
  if (v == null || v === '') return '—';
  return v === true || /^(y|yes|true|1)$/i.test(String(v)) ? 'Yes' : 'No';
};
const ACRONYMS = /\b(snf|hha|irf|ltch|dme|hcahps|hhcahps|asc|hac|drg|ma|cbsa|npi|ccn)\b/gi;
const humanize = (s) => {
  const t = String(s || '').replace(/_/g, ' ').trim().replace(ACRONYMS, (m) => m.toUpperCase());
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
        place: { text: [l.city, l.state, l.zip ? String(l.zip).slice(0, 5) : null].filter(Boolean).join(', ') || '—' },
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
        year: { text: text(u.dataYear) },
        services: { text: fmtInt(u.totalServices) },
        benes: { text: fmtInt(u.totalBeneficiaries) },
        payment: { text: fmtMoney(u.totalPayment) },
      }));
      return [table('utilization', 'Service Utilization', [col('service', 'Service'), col('year', 'Year', 'right'), col('services', 'Services', 'right'), col('benes', 'Beneficiaries', 'right'), col('payment', 'Medicare paid', 'right')], rows, 'No Medicare utilization on file.')];
    }
    case 'referrals': {
      const sent = (report.referralsFrom || []).map((r) => ({
        partner: { text: r.toName || r.toNpi || '—' },
        npi: { text: text(r.toNpi), to: providerLink(r.toNpi) },
        referrals: { text: fmtInt(r.totalReferrals) },
        benes: { text: fmtInt(r.totalBeneficiaries) },
        year: { text: text(r.dataYear) },
      }));
      const received = (report.referralsTo || []).map((r) => ({
        partner: { text: r.fromName || r.fromNpi || '—' },
        npi: { text: text(r.fromNpi), to: providerLink(r.fromNpi) },
        referrals: { text: fmtInt(r.totalReferrals) },
        benes: { text: fmtInt(r.totalBeneficiaries) },
        year: { text: text(r.dataYear) },
      }));
      const cols = [col('partner', 'Partner'), col('npi', 'NPI'), col('referrals', 'Shared patients', 'right'), col('benes', 'Beneficiaries', 'right'), col('year', 'Year', 'right')];
      const blocks = [
        table('referralsSent', 'Referrals Sent', cols, sent, 'No outbound shared-patient partners on file.'),
        table('referralsReceived', 'Referrals Received', cols, received, 'No inbound shared-patient partners on file.'),
      ];
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
        npi: { text: text(a.organization_npi), to: providerLink(a.organization_npi) },
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
        year: { text: text(f.dataYear) },
        payments: { text: f.totalPayments == null ? '—' : fmtMoney(f.totalPayments) },
      }));
      return [table('facilities', 'Linked Facilities', [col('name', 'Facility'), col('dataset', 'Dataset'), col('place', 'Location'), col('year', 'Year', 'right'), col('payments', 'Payments', 'right')], rows, 'No Medicare facility records linked.')];
    }
    case 'quality': {
      const rows = (report.quality || []).map((q) => ({
        dataset: { text: humanize(q.facilityType) },
        facility: { text: text(q.name) },
        rating: { text: num(q.qualityRating) == null ? '—' : `${num(q.qualityRating)} / 5` },
        year: { text: text(q.dataYear) },
      }));
      return [table('quality', 'Quality Measures', [col('dataset', 'Dataset'), col('facility', 'Facility'), col('rating', 'Star rating', 'right'), col('year', 'Year', 'right')], rows, 'No CMS quality ratings on file.')];
    }
    case 'ownership': {
      const rows = (report.ownership || []).map((o) => ({
        owner: { text: text(o.ownerName) },
        percentage: { text: num(o.percentage) == null ? '—' : `${num(o.percentage)}%` },
        type: { text: [o.ownerType, o.role].filter(Boolean).join(' · ') || '—' },
        dataset: { text: humanize(o.dataset) },
        year: { text: text(o.dataYear) },
      }));
      return [{
        ...table('ownership', 'Ownership Details', [col('owner', 'Owner'), col('percentage', 'Ownership', 'right'), col('type', 'Type / role'), col('dataset', 'Dataset'), col('year', 'Year', 'right')], rows, 'No linked ownership details on file.'),
        note: 'Up to 30 reported ownership or management interests. Missing percentages are not zero; interests may overlap and are not summed.',
      }];
    }
    case 'costReports': {
      const rows = (report.costReports || []).map((c) => ({
        dataset: { text: humanize(c.dataset) },
        period: { text: c.period || text(c.dataYear) },
        metric: { text: text(c.metric) },
        value: { text: isIdentifierField({ label: c.metric }) ? text(c.value) : c.format === 'money' ? fmtMoney(c.value) : fmtInt(c.value) },
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
        year: { text: text(q.dataYear) },
      }));
      return [{
        ...table('additionalQuality', 'Additional Quality Measures', [col('dataset', 'Dataset'), col('measure', 'Measure'), col('score', 'Reported score', 'right'), col('year', 'Year', 'right')], rows, 'No additional linked quality measures on file.'),
        note: 'Up to five measures per record, 20 overall. CMS scores retain their source units; measures and reporting periods are not directly comparable. Suppressed or unavailable scores are omitted.',
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
      return [table('enrichments', 'Enrichment Records', [col('field', 'Field'), col('value', 'Value'), col('source', 'Source'), col('confidence', 'Confidence'), col('status', 'Status')], rows, 'No enrichment records are available for this provider.')];
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
    identifiers.push({ label: 'CCN', value: text(f.providerId || providerId) });
    if (f.city || f.state) identifiers.push({ label: 'Location', value: [f.city, f.state].filter(Boolean).join(', ') });
    if (f.facilityTypes?.length) identifiers.push({ label: 'CMS datasets', value: f.facilityTypes.map(humanize).join(', ') });
    if (f.latestYear) identifiers.push({ label: 'Latest data year', value: String(f.latestYear) });
  } else if (providerId) {
    identifiers.push({ label: 'CCN', value: String(providerId) });
  }
  if (p) {
    identifiers.push({ label: f ? 'Linked NPI' : 'NPI', value: text(p.npi) });
    identifiers.push({ label: 'Entity type', value: p.entityType === '2' || /organ/i.test(String(p.entityType || '')) ? 'Organization' : 'Individual' });
    if (p.credential) identifiers.push({ label: 'Credential', value: p.credential });
    if (p.status) identifiers.push({ label: 'NPI status', value: humanize(p.status) });
    if (p.phone) identifiers.push({ label: 'Phone', value: p.phone });
    if (p.email) identifiers.push({ label: 'Email', value: p.email });
  } else if (npi && !f) {
    identifiers.push({ label: 'NPI', value: String(npi) });
  }

  const s = report.summary || {};
  const year = s.utilizationYears?.[0];
  // Medicare totals describe the NPI; a facility without one shows none rather than zeros.
  const metrics = p ? [
    { label: year ? `Medicare paid (${year})` : 'Medicare paid', value: fmtMoneyCompact(s.totalPayments ?? 0), tone: 'amber' },
    { label: 'Services', value: fmtInt(s.totalServices ?? 0), tone: 'cyan' },
    { label: 'Beneficiaries', value: fmtInt(s.totalBeneficiaries ?? 0), tone: 'emerald' },
    { label: 'Referrals out', value: fmtInt(s.totalReferralsOut ?? 0), tone: 'orange' },
    { label: 'Referrals in', value: fmtInt(s.totalReferralsIn ?? 0), tone: 'violet' },
  ] : [];
  return { identifiers, metrics };
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
  const sources = [...new Set(keys.map((k) => SECTION_SOURCES[k] || REPORT_SECTIONS.find((s) => s.key === k)?.source).filter(Boolean))];

  return {
    title,
    subtitle: isFacility ? 'Facility Intelligence Report' : 'Provider Intelligence Report',
    generatedAt,
    generatedLabel: generatedAt.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }),
    selectedKeys: keys,
    profile,
    sections,
    sources,
    attribution: exportAttribution(generatedAt),
  };
}

/** A safe file name for the report download. */
export function reportFileName(model) {
  const base = String(model?.title || 'report').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';
  return `CareMetric-Intel-${base}-${(model?.generatedAt || new Date()).toISOString().slice(0, 10)}`;
}

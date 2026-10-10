// Client copy of the merge-field rendering in server/functions/outreachHelpers.ts,
// used for the campaign preview. Keep the two in sync (tests/outreachMergeParity.test.js).

export const MERGE_FIELDS = [
  { key: 'provider_name', label: 'Provider name' },
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'credential', label: 'Credential' },
  { key: 'specialty', label: 'Specialty' },
  { key: 'organization_name', label: 'Organization' },
  { key: 'location_city', label: 'City' },
  { key: 'location_state', label: 'State' },
  { key: 'npi', label: 'NPI' },
];

export function renderTemplate(template, vars) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(vars?.[key] ?? ''));
}

export function buildMergeVars(provider, taxonomy, location) {
  const isOrg = provider?.entity_type === 'Organization';
  const first = (provider?.first_name || '').trim();
  const last = (provider?.last_name || '').trim();
  const fullName = [first, last].filter(Boolean).join(' ');
  const providerName = isOrg
    ? provider?.organization_name || ''
    : fullName
      ? `${/\b(MD|DO)\b/i.test(provider?.credential || '') ? 'Dr. ' : ''}${fullName}`
      : '';
  return {
    provider_name: providerName,
    first_name: isOrg ? provider?.organization_name || '' : first,
    last_name: last,
    credential: provider?.credential || '',
    specialty: taxonomy?.taxonomy_description || '',
    organization_name: provider?.organization_name || '',
    location_city: location?.city || '',
    location_state: location?.state || '',
    npi: provider?.npi || '',
  };
}

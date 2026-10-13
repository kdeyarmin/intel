export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export const finiteNumber = (value) => {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// Ignore malformed rows rather than turning them into measurements or links.
export function recordRows(value) {
  const displayKeys = ['name', 'city', 'state', 'fips', 'county_name', 'county_fips', 'npi', 'ccn', 'id', 'rank', 'data_year', 'specialty', 'index_note', 'address', 'zip5', 'license_number', 'license_type', 'status', 'licensee'];
  return Array.isArray(value) ? value.filter((row) => isRecord(row) &&
    displayKeys.every((key) => row[key] == null || typeof row[key] === 'string' || typeof row[key] === 'number')) : [];
}

export function scalarRecord(value) {
  return isRecord(value)
    ? Object.fromEntries(Object.entries(value).filter(([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v)))
    : {};
}

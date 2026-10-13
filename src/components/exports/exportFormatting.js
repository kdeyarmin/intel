function fieldName(value) {
  return String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/** Identifiers are text, even when the source supplies a numeric value. */
export function isIdentifierField(field = {}) {
  if (field.format === 'count' || field.format === 'number') return false;
  const names = [fieldName(field.key), fieldName(field.label)];
  if (names.some((name) => /(^|_)(counts?|totals?|number_of)(_|$)/.test(name))) return false;
  return names.some((name) => {
    return /(^|_)(year|years|zip|zipcode|postal|npi|ccn|fips|id|identifier|code|phone|fax|license|licence)(_|$)/.test(name)
      || /(^|_)(provider|facility|enrollment)_number(_|$)/.test(name);
  });
}

export function formatExportValue(value, field = {}) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return '';
  if (isIdentifierField(field)) return String(value);
  const number = Number(value);
  if (!Number.isFinite(number) || typeof value === 'boolean') return String(value);
  if (field.format === 'money' || /payment|revenue|expense|cost|charge|amount/i.test(`${field.key || ''} ${field.label || ''}`)) {
    return number.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  }
  return number.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

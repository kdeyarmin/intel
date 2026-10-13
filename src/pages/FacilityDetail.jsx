function isIdentifierField(key) {
  const k = key.toLowerCase();
  return k.includes('zip') || k.includes('associate') || k.includes('npi') || k.includes('ccn') || k.includes('id') || k.includes('year');
}

function formatCellValue(key, val) {
  if (val == null || val === '') return '—';
  if (isIdentifierField(key)) return String(val);
  if (isCurrencyField(key) && isNumericish(val)) return formatCurrency(val);
  if (isNumericish(val) && !String(val).includes('-') && String(val).length < 15) {
    const num = Number(String(val).replace(/[$,%]/g, ''));
    if (Number.isInteger(num) && num > 100) return num.toLocaleString();
  }
  return String(val);
}

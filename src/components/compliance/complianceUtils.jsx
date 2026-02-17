/**
 * Suppress small cell counts for privacy compliance
 * Values < 11 are suppressed per CMS guidelines
 */
export function suppressSmallCell(value, threshold = 11) {
  if (value === null || value === undefined) return null;
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(numValue)) return null;
  return numValue < threshold ? '<11' : numValue;
}

/**
 * Check if a value is suppressed
 */
export function isSuppressed(value) {
  return value === '<11' || value === null;
}

/**
 * Format a potentially suppressed value for display
 */
export function formatSuppressedValue(value, formatter = (v) => v) {
  const suppressed = suppressSmallCell(value);
  if (suppressed === '<11') return '<11';
  if (suppressed === null) return 'N/A';
  return formatter(suppressed);
}
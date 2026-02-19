/**
 * Centralized date formatting utilities — all times displayed in US Eastern Time.
 */

const ET_TIMEZONE = 'America/New_York';

/**
 * Format a date/time string to Eastern Time with full date and time.
 * e.g. "Jan 15, 2025, 3:45 PM ET"
 */
export function formatDateTimeET(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: ET_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' ET';
}

/**
 * Format a date string to Eastern Time, date only.
 * e.g. "Jan 15, 2025"
 */
export function formatDateET(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: ET_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date string to Eastern Time, short (for compact display).
 * e.g. "Jan 15, 3:45 PM"
 */
export function formatShortDateTimeET(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: ET_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format time only in Eastern Time.
 * e.g. "3:45 PM ET"
 */
export function formatTimeET(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: ET_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' ET';
}
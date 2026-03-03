// Centralized error categorization with solutions and documentation links

export const ERROR_CATEGORIES = {
  invalid_npi: {
    label: 'Invalid NPI',
    icon: 'ShieldAlert',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20',
    badgeColor: 'bg-red-500/15 text-red-400',
    keywords: ['npi', '10 digits', 'npi format', 'invalid npi', 'npi validation'],
    description: 'NPI numbers must be exactly 10 digits. Records with invalid NPIs are rejected.',
    solutions: [
      'Ensure the NPI column is mapped correctly in your column mapping',
      'Check for leading zeros being stripped — NPIs starting with 0 need to be treated as text',
      'Verify NPIs are 10-digit numeric values with no letters or special characters',
      'Cross-reference against the NPPES NPI Registry to confirm validity',
    ],
    docUrl: 'https://npiregistry.cms.hhs.gov/',
    docLabel: 'CMS NPI Registry Lookup',
  },
  empty_row: {
    label: 'Empty / Spacer Row',
    icon: 'FileWarning',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
    badgeColor: 'bg-slate-500/15 text-slate-400',
    keywords: ['empty_row', 'empty row', 'no label or metrics', 'spacer row', 'no label', 'no data'],
    description: 'Rows with no label and no numeric data — typically visual separators, headers, or footers in CMS Excel files.',
    solutions: [
      'These are safe to ignore — they are spacer/separator rows in CMS spreadsheets',
      'The importer automatically skips these rows during processing',
      'If you see many of these, the file may have complex multi-table layouts that need sheet-specific parsing',
    ],
    docUrl: null,
    docLabel: null,
  },
  missing_required: {
    label: 'Missing Required Field',
    icon: 'FileWarning',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
    badgeColor: 'bg-amber-500/15 text-amber-400',
    keywords: ['missing', 'required', 'null', 'undefined', 'blank', 'not provided', 'is required'],
    description: 'One or more required fields are missing or empty in these records.',
    solutions: [
      'Check that all required columns are mapped in the Column Mapping step',
      'Verify your CSV has no blank rows or rows with empty required fields',
      'If columns have different names, re-map them using the column mapper',
      'For NPPES imports: NPI, Entity Type Code, and Provider Last Name are required',
    ],
    docUrl: 'https://download.cms.gov/nppes/NPI_Files.html',
    docLabel: 'NPPES File Layout Documentation',
  },
  formatting_error: {
    label: 'Invalid Format',
    icon: 'Type',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 border-orange-500/20',
    badgeColor: 'bg-orange-500/15 text-orange-400',
    keywords: ['format', 'malformed', 'parse', 'invalid date', 'invalid number', 'not a number', 'NaN', 'JSON', 'encoding', 'charset', 'unexpected token', 'csv', 'column count', 'invalid format', 'wrong format'],
    description: 'Data values are in the wrong format or cannot be parsed correctly (e.g., dates, numbers, encoded text).',
    solutions: [
      'Ensure dates are in YYYY-MM-DD or MM/DD/YYYY format',
      'Check that numeric fields contain only numbers (no commas, dollar signs, or text)',
      'Verify the CSV file uses UTF-8 encoding — re-save from Excel as "CSV UTF-8"',
      'If fields contain commas, ensure they are properly quoted in the CSV',
    ],
    docUrl: null,
    docLabel: null,
  },
  out_of_range: {
    label: 'Out of Range',
    icon: 'AlertTriangle',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10 border-pink-500/20',
    badgeColor: 'bg-pink-500/15 text-pink-400',
    keywords: ['out of range', 'too large', 'too small', 'minimum', 'maximum', 'overflow', 'negative', 'range', 'below', 'above', 'boundary', 'invalid value'],
    description: 'Values are outside the acceptable range for their field (e.g., negative counts, percentages over 100, dates in the future).',
    solutions: [
      'Review the expected ranges for each field (e.g., percentages 0-100, years 1900-2100)',
      'Check for data entry errors like extra digits or misplaced decimal points',
      'Filter outlier rows in the source file before re-importing',
      'Use the Row Range retry option to skip over known problematic ranges',
    ],
    docUrl: null,
    docLabel: null,
  },
  duplicate_record: {
    label: 'Duplicate Record',
    icon: 'Copy',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10 border-violet-500/20',
    badgeColor: 'bg-violet-500/15 text-violet-400',
    keywords: ['duplicate', 'unique', 'constraint', 'conflict', 'already exists', 'duplicate key'],
    description: 'Records with the same key already exist in the database or appear multiple times in the file.',
    solutions: [
      'Deduplicate your source file before importing (remove rows with the same NPI)',
      'Use the "Update existing records" option to merge instead of creating duplicates',
      'If importing NPPES monthly, existing providers are automatically updated — this is expected',
    ],
    docUrl: null,
    docLabel: null,
  },
  timeout_stall: {
    label: 'Timeout / Stall',
    icon: 'Clock',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
    badgeColor: 'bg-blue-500/15 text-blue-400',
    keywords: ['timeout', 'timed out', 'stalled', 'exceeded', 'too long', 'abort', 'execution time', 'inactivity'],
    description: 'The import took too long or stalled without progress.',
    solutions: [
      'Split large files into smaller batches (under 50,000 rows per file)',
      'Retry the import — transient server load may have caused the timeout',
      'For CMS API imports, try during off-peak hours (evenings or weekends)',
      'Check your internet connection stability for large file uploads',
    ],
    docUrl: null,
    docLabel: null,
  },
  network_api: {
    label: 'Network / API Error',
    icon: 'Wifi',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10 border-cyan-500/20',
    badgeColor: 'bg-cyan-500/15 text-cyan-400',
    keywords: ['HTTP', 'fetch', 'network', 'connection', 'rate limit', '429', '500', '503', 'ECONNREFUSED', 'socket'],
    description: 'A network issue or API error prevented the import from completing.',
    solutions: [
      'Wait a few minutes and retry — the external API may be temporarily down',
      'If you see "429" errors, you are being rate-limited — slow down requests',
      'Check that the source URL is still valid and accessible',
      'For CMS data.gov API errors, check their status page for outages',
    ],
    docUrl: 'https://data.cms.gov/',
    docLabel: 'CMS Data Portal',
  },
  manual_action: {
    label: 'Manual Action',
    icon: 'Wrench',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
    badgeColor: 'bg-slate-500/15 text-slate-400',
    keywords: ['manually', 'cancelled', 'user', 'skipped', 'marked as'],
    description: 'This batch was manually stopped or modified by a user.',
    solutions: [
      'If the underlying issue has been resolved, retry the import',
      'Check the cancel reason or skip note for more context',
    ],
    docUrl: null,
    docLabel: null,
  },
  other: {
    label: 'Other',
    icon: 'HelpCircle',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
    badgeColor: 'bg-slate-500/15 text-slate-400',
    keywords: [],
    description: 'Uncategorized errors that don\'t match known patterns.',
    solutions: [
      'Review the full error message for clues',
      'Try re-running the import with dry-run mode to isolate the issue',
      'If the error persists, download the error log CSV and examine the affected rows',
    ],
    docUrl: null,
    docLabel: null,
  },
};

export function categorizeError(message) {
  if (!message) return 'other';
  const lower = message.toLowerCase();
  for (const [key, config] of Object.entries(ERROR_CATEGORIES)) {
    if (key === 'other') continue;
    if (config.keywords.some(kw => lower.includes(kw))) return key;
  }
  return 'other';
}

// Extract the best message string from an error object (supports both .message and .detail)
export function getErrorMessage(err) {
  return err.message || err.detail || '';
}

export function groupErrors(errors) {
  if (!errors || errors.length === 0) return { grouped: {}, sortedCategories: [], totalErrors: 0 };
  const grouped = {};
  for (const err of errors) {
    const cat = categorizeError(getErrorMessage(err));
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(err);
  }
  const sortedCategories = Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length);
  return { grouped, sortedCategories, totalErrors: errors.length };
}

export function downloadErrorCSV(errors, batchName) {
  const headers = ['Row', 'NPI', 'Category', 'Phase', 'Field', 'Message'];
  const rows = errors.map(e => {
    const msg = getErrorMessage(e);
    return [
      e.row ?? '', e.npi ?? '',
      ERROR_CATEGORIES[categorizeError(msg)]?.label || 'Other',
      e.phase || '', e.field || '',
      msg.replace(/"/g, '""'),
    ];
  });
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `errors_${batchName || 'batch'}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}
import { describe, it, expect } from 'vitest';
import {
  ERROR_CATEGORIES,
  categorizeError,
  isErrorRetryable,
  suggestedActionFor,
  severityFor,
  getErrorMessage,
  groupErrors,
} from '../src/components/imports/errorCategories.jsx';

describe('categorizeError', () => {
  it('returns "other" for missing or empty message', () => {
    expect(categorizeError(null)).toBe('other');
    expect(categorizeError(undefined)).toBe('other');
    expect(categorizeError('')).toBe('other');
  });

  it('matches NPI errors to invalid_npi', () => {
    expect(categorizeError('NPI must be 10 digits')).toBe('invalid_npi');
    expect(categorizeError('Invalid NPI format')).toBe('invalid_npi');
  });

  it('matches missing-required errors to missing_required', () => {
    expect(categorizeError('Field "category" is required')).toBe('missing_required');
    expect(categorizeError('Missing required field')).toBe('missing_required');
  });

  it('matches duplicate-key errors to duplicate_record', () => {
    expect(categorizeError('Duplicate key constraint')).toBe('duplicate_record');
    expect(categorizeError('Record already exists')).toBe('duplicate_record');
  });

  it('matches network/HTTP errors to network_api', () => {
    expect(categorizeError('HTTP 500 Internal Server Error')).toBe('network_api');
    expect(categorizeError('Rate limit exceeded')).toBe('network_api');
    expect(categorizeError('Connection refused: ECONNREFUSED')).toBe('network_api');
    expect(categorizeError('429 Too Many Requests')).toBe('network_api');
  });

  it('matches timeout messages to timeout_stall', () => {
    expect(categorizeError('Operation timed out')).toBe('timeout_stall');
    expect(categorizeError('Execution time exceeded')).toBe('timeout_stall');
    expect(categorizeError('Aborted after stall')).toBe('timeout_stall');
  });

  it('matches empty-row markers to empty_row', () => {
    expect(categorizeError('empty_row: no label or metrics')).toBe('empty_row');
    expect(categorizeError('Spacer row detected')).toBe('empty_row');
  });

  it('matches format errors to formatting_error', () => {
    expect(categorizeError('Unexpected token in JSON')).toBe('formatting_error');
    expect(categorizeError('Invalid date format')).toBe('formatting_error');
    expect(categorizeError('NaN encountered')).toBe('formatting_error');
  });

  it('matches range-violation errors to out_of_range', () => {
    expect(categorizeError('Value out of range')).toBe('out_of_range');
    expect(categorizeError('Negative count detected')).toBe('out_of_range');
  });

  it('matches user-action messages to manual_action', () => {
    expect(categorizeError('Cancelled by user')).toBe('manual_action');
    expect(categorizeError('Manually skipped batch')).toBe('manual_action');
  });

  it('falls back to "other" for unmatched messages', () => {
    expect(categorizeError('Something completely unexpected')).toBe('other');
  });

  it('priority order: network beats timeout when both keywords present', () => {
    // "rate limit" + "timed out" — network_api comes first in priority.
    expect(categorizeError('Rate limit reached, request timed out')).toBe('network_api');
  });
});

describe('isErrorRetryable', () => {
  it('marks transient categories as retryable', () => {
    expect(isErrorRetryable('Operation timed out')).toBe(true);
    expect(isErrorRetryable('HTTP 500')).toBe(true);
  });

  it('marks data-quality categories as non-retryable', () => {
    expect(isErrorRetryable('Invalid NPI')).toBe(false);
    expect(isErrorRetryable('Field is required')).toBe(false);
    expect(isErrorRetryable('Duplicate record')).toBe(false);
  });

  it('returns false for unknown messages (default to non-retryable)', () => {
    expect(isErrorRetryable('Some new mystery failure')).toBe(false);
  });
});

describe('suggestedActionFor', () => {
  it('suggests retry for transient errors', () => {
    expect(suggestedActionFor('Operation timed out')).toBe('retry');
  });

  it('suggests retry_later for rate-limit-style errors', () => {
    expect(suggestedActionFor('HTTP 429 Too Many Requests')).toBe('retry_later');
  });

  it('suggests fix_data for invalid input', () => {
    expect(suggestedActionFor('Invalid NPI')).toBe('fix_data');
    expect(suggestedActionFor('Field is required')).toBe('fix_data');
  });

  it('suggests skip for empty rows and duplicates', () => {
    expect(suggestedActionFor('empty_row: spacer')).toBe('skip');
    expect(suggestedActionFor('Duplicate key')).toBe('skip');
  });

  it('suggests manual for unknown messages', () => {
    expect(suggestedActionFor('Mystery failure')).toBe('manual');
  });
});

describe('severityFor', () => {
  it('returns the severity declared on the matching category', () => {
    expect(severityFor('HTTP 500')).toBe('high');
    expect(severityFor('Invalid NPI')).toBe('medium');
    expect(severityFor('empty_row spacer')).toBe('low');
  });

  it('defaults to "low" for unknown messages', () => {
    expect(severityFor('Something new')).toBe('low');
  });
});

describe('ERROR_CATEGORIES taxonomy invariants', () => {
  it('every category has retryable + suggested_action + severity declared', () => {
    for (const [key, cat] of Object.entries(ERROR_CATEGORIES)) {
      expect(typeof cat.retryable, `${key}.retryable`).toBe('boolean');
      expect(['retry', 'retry_later', 'fix_data', 'skip', 'manual']).toContain(cat.suggested_action);
      expect(['low', 'medium', 'high']).toContain(cat.severity);
    }
  });

  it('only retryable categories have suggested_action of retry/retry_later', () => {
    for (const [key, cat] of Object.entries(ERROR_CATEGORIES)) {
      const isRetryAction = cat.suggested_action === 'retry' || cat.suggested_action === 'retry_later';
      if (isRetryAction) {
        expect(cat.retryable, `${key} has retry action but retryable=false`).toBe(true);
      }
    }
  });

  it('every category has a label and at least one solution', () => {
    for (const [key, cat] of Object.entries(ERROR_CATEGORIES)) {
      expect(cat.label, `${key}.label`).toBeTruthy();
      expect(Array.isArray(cat.solutions), `${key}.solutions`).toBe(true);
      expect(cat.solutions.length, `${key}.solutions length`).toBeGreaterThan(0);
    }
  });
});

describe('getErrorMessage', () => {
  it('prefers .message over .detail', () => {
    expect(getErrorMessage({ message: 'M', detail: 'D' })).toBe('M');
  });

  it('falls back to .detail when .message missing', () => {
    expect(getErrorMessage({ detail: 'D' })).toBe('D');
  });

  it('returns empty string when neither is set', () => {
    expect(getErrorMessage({})).toBe('');
  });
});

describe('groupErrors', () => {
  it('returns empty result when given no errors', () => {
    const result = groupErrors([]);
    expect(result.totalErrors).toBe(0);
    expect(result.grouped).toEqual({});
    expect(result.sortedCategories).toEqual([]);
  });

  it('groups errors by category and sorts by frequency descending', () => {
    const errors = [
      { message: 'Invalid NPI 1' },
      { message: 'Invalid NPI 2' },
      { message: 'HTTP 500' },
      { message: 'Invalid NPI 3' },
    ];
    const result = groupErrors(errors);
    expect(result.totalErrors).toBe(4);
    expect(result.grouped.invalid_npi).toHaveLength(3);
    expect(result.grouped.network_api).toHaveLength(1);
    expect(result.sortedCategories[0]).toBe('invalid_npi');
    expect(result.sortedCategories[1]).toBe('network_api');
  });

  it('uses .detail when .message is missing', () => {
    const errors = [{ detail: 'NPI must be 10 digits' }];
    const result = groupErrors(errors);
    expect(result.grouped.invalid_npi).toHaveLength(1);
  });

  it('falls back to "other" for unrecognized messages', () => {
    const errors = [{ message: 'mysterious failure' }];
    const result = groupErrors(errors);
    expect(result.grouped.other).toHaveLength(1);
  });
});

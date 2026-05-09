import { describe, it, expect } from 'vitest';
import { pickResumeOffset, resumeProgressPct } from '../src/components/imports/resumeOffset.js';

describe('pickResumeOffset', () => {
  it('returns nulls when retry_params is missing', () => {
    expect(pickResumeOffset(null)).toEqual({ resumeOffset: null, resumeIsByteOffset: false });
    expect(pickResumeOffset(undefined)).toEqual({ resumeOffset: null, resumeIsByteOffset: false });
  });

  it('returns nulls when retry_params is empty', () => {
    expect(pickResumeOffset({})).toEqual({ resumeOffset: null, resumeIsByteOffset: false });
  });

  it('prefers resume_offset over row_offset and byte_offset', () => {
    const result = pickResumeOffset({
      resume_offset: 100,
      row_offset: 200,
      byte_offset: 9999,
    });
    expect(result).toEqual({ resumeOffset: 100, resumeIsByteOffset: false });
  });

  it('prefers row_offset over byte_offset (row is more meaningful for progress)', () => {
    const result = pickResumeOffset({
      row_offset: 500,
      byte_offset: 1024 * 1024,
    });
    expect(result).toEqual({ resumeOffset: 500, resumeIsByteOffset: false });
  });

  it('falls back to byte_offset and flags it as a byte offset', () => {
    const result = pickResumeOffset({ byte_offset: 1024 });
    expect(result).toEqual({ resumeOffset: 1024, resumeIsByteOffset: true });
  });

  it('treats 0 as a valid offset (not the same as null)', () => {
    expect(pickResumeOffset({ resume_offset: 0 })).toEqual({
      resumeOffset: 0,
      resumeIsByteOffset: false,
    });
    expect(pickResumeOffset({ row_offset: 0 })).toEqual({
      resumeOffset: 0,
      resumeIsByteOffset: false,
    });
    expect(pickResumeOffset({ byte_offset: 0 })).toEqual({
      resumeOffset: 0,
      resumeIsByteOffset: true,
    });
  });

  it('skips nullish keys when picking', () => {
    // resume_offset explicitly null — should fall through to row_offset.
    const result = pickResumeOffset({ resume_offset: null, row_offset: 250 });
    expect(result).toEqual({ resumeOffset: 250, resumeIsByteOffset: false });
  });
});

describe('resumeProgressPct', () => {
  it('computes a percentage when offset is row-based and total_rows is known', () => {
    expect(resumeProgressPct(250, false, 1000)).toBe(25);
    expect(resumeProgressPct(1000, false, 1000)).toBe(100);
  });

  it('clamps to 100 when offset exceeds total (e.g. import grew mid-resume)', () => {
    expect(resumeProgressPct(1500, false, 1000)).toBe(100);
  });

  it('returns null when the offset is byte-based (% of bytes is meaningless to a row count)', () => {
    expect(resumeProgressPct(1024, true, 1000)).toBeNull();
  });

  it('returns null when total_rows is unknown or zero', () => {
    expect(resumeProgressPct(250, false, null)).toBeNull();
    expect(resumeProgressPct(250, false, undefined)).toBeNull();
    expect(resumeProgressPct(250, false, 0)).toBeNull();
  });

  it('returns null when offset is not a number', () => {
    expect(resumeProgressPct(null, false, 1000)).toBeNull();
    expect(resumeProgressPct(undefined, false, 1000)).toBeNull();
  });

  it('rounds to nearest integer percent', () => {
    expect(resumeProgressPct(333, false, 1000)).toBe(33);
    expect(resumeProgressPct(335, false, 1000)).toBe(34); // 33.5 rounds up
  });
});

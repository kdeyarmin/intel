import { describe, expect, it } from 'vitest';
import { freshnessSentence, summarizeFreshness } from '../src/lib/dataFreshnessSummary';

const data = {
  datasets: [
    { import_type: 'a', status: 'current', data_year: '2025', imported_at: '2026-09-01T00:00:00Z' },
    { import_type: 'b', status: 'update_available', data_year: '2024', imported_at: '2026-08-01T00:00:00Z' },
    { import_type: 'c', status: 'never_imported', data_year: null, imported_at: null },
    { import_type: 'd', status: 'failed', data_year: '2023', imported_at: '2026-07-01T00:00:00Z' },
  ],
  geography: { loaded: true, vintage: '2020' },
};

describe('summarizeFreshness', () => {
  it('counts loaded datasets, their year range, the latest import and pending releases', () => {
    const s = summarizeFreshness(data);
    // 'd' failed its latest refresh, but the import before it is still what the pages show.
    expect(s.loadedCount).toBe(3);
    expect(s.yearRange).toEqual([2023, 2025]);
    expect(s.lastImportedAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(s.updatesAvailable).toBe(1);
    expect(s.censusVintage).toBe('2020');
  });

  it('copes with no data', () => {
    expect(summarizeFreshness(null)).toMatchObject({ loadedCount: 0, yearRange: null, lastImportedAt: null, updatesAvailable: 0, censusVintage: null });
  });
});

describe('freshnessSentence', () => {
  it('names the sources with years and the refresh date', () => {
    const text = freshnessSentence(summarizeFreshness(data), (d) => d.toISOString().slice(0, 10));
    expect(text).toBe('Data sources: 3 CMS datasets loaded (data years 2023–2025, last refreshed 2026-09-01), NPPES registry, U.S. Census 2020 geography. 1 newer release awaiting import.');
  });

  it('falls back to a generic line before the data arrives', () => {
    expect(freshnessSentence(null)).toMatch(/^Data sources: CMS public use files/);
    expect(freshnessSentence(summarizeFreshness({ datasets: [] }))).toBe('Data sources: CMS public use files, NPPES registry, U.S. Census geography.');
  });
});

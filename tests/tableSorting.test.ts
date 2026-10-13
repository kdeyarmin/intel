import { describe, expect, it } from 'vitest';
import { nextSort, sortRows } from '../src/lib/tableSorting';

describe('table sorting', () => {
  it('toggles the selected column and defaults new columns to descending', () => {
    expect(nextSort({ key: 'name', direction: 'asc' }, 'name')).toEqual({ key: 'name', direction: 'desc' });
    expect(nextSort({ key: 'name', direction: 'desc' }, 'score')).toEqual({ key: 'score', direction: 'desc' });
    expect(nextSort({ key: 'name', direction: 'desc' }, 'name', 'asc')).toEqual({ key: 'name', direction: 'asc' });
  });

  it('sorts values in either direction, keeps missing values last and preserves ties', () => {
    const rows = [
      { name: 'Beta', score: 2 },
      { name: 'Alpha', score: null },
      { name: 'Alpha', score: 2 },
      { name: 'Gamma', score: 1 },
    ];
    expect(sortRows(rows, { key: 'score', direction: 'desc' }).map((row) => row.name))
      .toEqual(['Beta', 'Alpha', 'Gamma', 'Alpha']);
    expect(sortRows(rows, { key: 'name', direction: 'asc' }).map((row) => row.score))
      .toEqual([null, 2, 2, 1]);
  });
});

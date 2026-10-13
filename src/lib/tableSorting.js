export function nextSort(current, key, initialDirection = 'desc') {
  if (current?.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: initialDirection };
}

export function sortRows(rows, sort, getValue = (row, key) => row[key]) {
  const direction = sort?.direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: getValue(row, sort?.key) }))
    .sort((a, b) => {
      const aMissing = a.value == null || a.value === '';
      const bMissing = b.value == null || b.value === '';
      if (aMissing || bMissing) return aMissing === bMissing ? a.index - b.index : aMissing ? 1 : -1;
      const comparison = typeof a.value === 'string' || typeof b.value === 'string'
        ? String(a.value).localeCompare(String(b.value), undefined, { numeric: true, sensitivity: 'base' })
        : a.value === b.value ? 0 : a.value < b.value ? -1 : 1;
      return comparison === 0 ? a.index - b.index : comparison * direction;
    })
    .map(({ row }) => row);
}

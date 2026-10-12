// Pure summary of getDataFreshness for the footer line (tested in node).

export function summarizeFreshness(data) {
  const datasets = Array.isArray(data?.datasets) ? data.datasets : [];
  // Loaded means its rows are in the tables, whatever the latest refresh did: a failed
  // refresh keeps the earlier import (and its year) on the pages, so the footer counts it.
  const loaded = datasets.filter((d) => d.imported_at);
  const years = loaded.map((d) => Number(d.data_year)).filter((y) => Number.isInteger(y));
  const imports = loaded.map((d) => new Date(d.imported_at).getTime()).filter((t) => Number.isFinite(t));
  const updates = datasets.filter((d) => d.status === 'update_available').length;
  const geo = data?.geography;
  return {
    loadedCount: loaded.length,
    yearRange: years.length ? [Math.min(...years), Math.max(...years)] : null,
    lastImportedAt: imports.length ? new Date(Math.max(...imports)) : null,
    updatesAvailable: updates,
    censusVintage: geo?.loaded && geo.vintage ? String(geo.vintage) : null,
  };
}

export function freshnessSentence(summary, formatDate = (d) => d.toLocaleDateString()) {
  if (!summary) return 'Data sources: CMS public use files, the NPPES registry and U.S. Census geography.';
  const parts = [];
  if (summary.loadedCount > 0) {
    const years = summary.yearRange
      ? summary.yearRange[0] === summary.yearRange[1] ? `data year ${summary.yearRange[0]}` : `data years ${summary.yearRange[0]}–${summary.yearRange[1]}`
      : null;
    const when = summary.lastImportedAt ? `last refreshed ${formatDate(summary.lastImportedAt)}` : null;
    parts.push(`${summary.loadedCount} CMS dataset${summary.loadedCount === 1 ? '' : 's'} loaded${years ? ` (${years}${when ? `, ${when}` : ''})` : when ? ` (${when})` : ''}`);
  } else {
    parts.push('CMS public use files');
  }
  parts.push('NPPES registry');
  parts.push(summary.censusVintage ? `U.S. Census ${summary.censusVintage} geography` : 'U.S. Census geography');
  let text = `Data sources: ${parts.join(', ')}.`;
  if (summary.updatesAvailable > 0) text += ` ${summary.updatesAvailable} newer release${summary.updatesAvailable === 1 ? '' : 's'} awaiting import.`;
  return text;
}

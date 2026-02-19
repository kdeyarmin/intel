import { jsPDF } from 'jspdf';

/**
 * Filter data rows by date range on a given date field.
 */
export function filterByDateRange(data, dateField, startDate, endDate) {
  if (!startDate && !endDate) return data;
  return data.filter(row => {
    const val = row[dateField];
    if (!val) return false;
    const d = new Date(val);
    if (startDate && d < new Date(startDate)) return false;
    if (endDate && d > new Date(endDate + 'T23:59:59')) return false;
    return true;
  });
}

/**
 * Pick only the selected columns from each row.
 */
export function pickFields(rows, fields) {
  return rows.map(row => {
    const picked = {};
    fields.forEach(f => { picked[f.key] = row[f.key] ?? ''; });
    return picked;
  });
}

function escapeCSV(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Export rows to CSV and trigger download.
 */
export function exportCSV(rows, fields, fileName) {
  const header = fields.map(f => escapeCSV(f.label)).join(',');
  const body = rows.map(row =>
    fields.map(f => escapeCSV(row[f.key])).join(',')
  ).join('\n');
  const csv = header + '\n' + body;
  downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), fileName + '.csv');
}

/**
 * Export rows to an Excel-compatible TSV file (.xls) for broad compatibility.
 */
export function exportExcel(rows, fields, fileName) {
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table>';
  html += '<tr>' + fields.map(f => `<th style="font-weight:bold;background:#e2e8f0">${f.label}</th>`).join('') + '</tr>';
  rows.forEach(row => {
    html += '<tr>' + fields.map(f => `<td>${row[f.key] ?? ''}</td>`).join('') + '</tr>';
  });
  html += '</table></body></html>';
  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel' }), fileName + '.xls');
}

/**
 * Export rows to PDF and trigger download.
 */
export function exportPDF(rows, fields, fileName, title) {
  const doc = new jsPDF({ orientation: fields.length > 5 ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();

  // Title
  doc.setFontSize(16);
  doc.text(title || fileName, 14, 18);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString()} • ${rows.length} records`, 14, 25);
  doc.setTextColor(0);

  // Table
  const colW = (pageW - 28) / fields.length;
  let y = 34;

  // Header row
  doc.setFontSize(7);
  doc.setFillColor(226, 232, 240);
  doc.rect(14, y - 4, pageW - 28, 7, 'F');
  fields.forEach((f, i) => {
    doc.setFont(undefined, 'bold');
    doc.text(String(f.label).substring(0, 18), 14 + i * colW, y);
  });
  y += 8;

  // Data rows
  doc.setFont(undefined, 'normal');
  doc.setFontSize(6.5);
  rows.forEach((row) => {
    if (y > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 18;
    }
    fields.forEach((f, i) => {
      const val = String(row[f.key] ?? '').substring(0, 22);
      doc.text(val, 14 + i * colW, y);
    });
    y += 6;
  });

  doc.save(fileName + '.pdf');
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
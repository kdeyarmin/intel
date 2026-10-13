import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';
import { CAREMETRIC_LOGO_URL } from '@/lib/branding';

const CAREMETRIC_WEBSITE = 'www.CareMetric.ai';

/** The source line every export carries (CMS asks that derived data not be presented as CMS data). */
export function exportAttribution(date = new Date()) {
  return `Source: CareMetric analytics derived from public CMS, NPPES and U.S. Census data, not CMS publications. Medicare figures are fee-for-service unless noted; counts under 11 are suppressed. Exported ${date.toISOString().slice(0, 10)}.`;
}

/**
 * Counts one export against the organization's daily allowance before a file
 * is built. `ok: false` carries the message to show: the day's limit is used
 * up, or the count itself failed (offline, server error, a database that
 * couldn't record it). A file is built only after a confirmed count, so the
 * allowance can't be dodged by blocking or breaking the request.
 *
 * This is the metering path for exports built from data the view already
 * fetched. Exports that fetch an export-sized payload from the server instead
 * set `for_export: true` on that request (see DMEProviderReport.jsx): the
 * functions dispatcher and the entity router then consume the quota
 * server-side before the handler runs, which cannot be skipped. window.print()
 * exports keep this call as their only metering — printing can't be gated
 * server-side.
 */
export async function countExport() {
  try {
    const res = await base44.billing.countExport();
    if (res?.counted === false) return { ok: false, message: COUNT_FAILED };
    return { ok: true };
  } catch (err) {
    if (err?.status === 429) return { ok: false, message: err.message || "Today's export limit for your organization has been reached." };
    return { ok: false, message: COUNT_FAILED };
  }
}

const COUNT_FAILED = "Couldn't check your daily export allowance. Try again in a moment.";

/**
 * Load image as base64 for embedding in PDF. Null when it can't be loaded:
 * a PDF without the logo is still a PDF.
 */
async function loadImageAsBase64(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// The logo is fetched the first time a PDF is built, not when this module loads:
// pages that only export CSV (or never export) shouldn't call a third-party host.
let _logoPromise = null;
export function pdfLogo() {
  _logoPromise ??= loadImageAsBase64(CAREMETRIC_LOGO_URL);
  return _logoPromise;
}

/**
 * Add branded header to a PDF page.
 */
function addPDFHeader(doc, title, logoBase64) {
  const pageW = doc.internal.pageSize.getWidth();
  
  // Header background bar
  doc.setFillColor(30, 64, 175); // blue-800
  doc.rect(0, 0, pageW, 28, 'F');
  
  // Logo
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 10, 3, 22, 22); } catch {}
  }
  
  // Brand text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('CareMetric AI', logoBase64 ? 36 : 14, 14);
  doc.setFontSize(7);
  doc.setFont(undefined, 'normal');
  doc.text('Provider Intel', logoBase64 ? 36 : 14, 20);
  
  // Website right-aligned
  doc.setFontSize(7);
  doc.text(CAREMETRIC_WEBSITE, pageW - 14, 14, { align: 'right' });
  
  // Reset text color
  doc.setTextColor(0, 0, 0);
  
  // Title
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text(title || '', 14, 40);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 47);
  doc.setTextColor(0);
  
  return 54; // y position after header
}

/**
 * Add branded footer to a PDF page.
 */
function addPDFFooter(doc, pageNum) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  
  doc.setDrawColor(200);
  doc.line(14, pageH - 16, pageW - 14, pageH - 16);
  
  doc.setFontSize(6);
  doc.setTextColor(150);
  doc.text(`CareMetric AI  •  ${CAREMETRIC_WEBSITE}  •  Confidential`, 14, pageH - 10);
  doc.text(exportAttribution(), 14, pageH - 6, { maxWidth: pageW - 50 });
  doc.text(`Page ${pageNum}`, pageW - 14, pageH - 10, { align: 'right' });
  doc.setTextColor(0);
}

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
export function exportCSV(rows, fields, fileName, { notes = [] } = {}) {
  const header = fields.map(f => escapeCSV(f.label)).join(',');
  const body = rows.map(row =>
    fields.map(f => escapeCSV(row[f.key])).join(',')
  ).join('\n');
  // Notes (the data vintages a view used) and the attribution are last lines, each quoted so it stays a single cell.
  const trailer = [...notes.filter(Boolean), exportAttribution()].map(escapeCSV).join('\n');
  const csv = header + '\n' + body + '\n' + trailer;
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
  html += `<tr><td colspan="${fields.length}" style="color:#64748b;font-size:10px">${exportAttribution()}</td></tr>`;
  html += '</table></body></html>';
  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel' }), fileName + '.xls');
}

/**
 * Export rows to PDF and trigger download.
 */
export async function exportPDF(rows, fields, fileName, title) {
  const logoBase64 = await pdfLogo();

  const doc = new jsPDF({ orientation: fields.length > 5 ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  let pageNum = 1;

  // Branded header
  let y = addPDFHeader(doc, title || fileName, logoBase64);

  // Record count
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`${rows.length} records`, pageW - 14, 47, { align: 'right' });
  doc.setTextColor(0);

  // Table
  const colW = (pageW - 28) / fields.length;

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
    if (y > doc.internal.pageSize.getHeight() - 22) {
      addPDFFooter(doc, pageNum);
      pageNum++;
      doc.addPage();
      y = 18;
    }
    fields.forEach((f, i) => {
      const val = String(row[f.key] ?? '').substring(0, 22);
      doc.text(val, 14 + i * colW, y);
    });
    y += 6;
  });

  // Footer on last page
  addPDFFooter(doc, pageNum);

  doc.save(fileName + '.pdf');
}

/**
 * Export rows to JSON and trigger download.
 */
export function exportJSON(rows, fields, fileName) {
  const records = rows.map(row => {
    const obj = {};
    fields.forEach(f => { obj[f.key] = row[f.key] ?? null; });
    return obj;
  });
  // The source line travels with the data (a bare array has nowhere to put it).
  const json = JSON.stringify({ source: exportAttribution(), records }, null, 2);
  downloadBlob(new Blob([json], { type: 'application/json' }), fileName + '.json');
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
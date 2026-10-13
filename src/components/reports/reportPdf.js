import { jsPDF } from 'jspdf';
import { pdfLogo } from '@/components/exports/exportUtils';
import { reportFileName } from './reportSections';

const MARGIN = 14;
const HEADER_H = 20;
const FOOTER_H = 20;
const NAVY = [15, 23, 42]; // slate-900
const ACCENT = [8, 145, 178]; // cyan-600
const INK = [15, 23, 42];
const MUTED = [71, 85, 105]; // slate-600
const RULE = [203, 213, 225]; // slate-300
const HEAD_FILL = [226, 232, 240]; // slate-200
const ZEBRA = [248, 250, 252]; // slate-50

function drawPageHeader(doc, model, logo) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, HEADER_H, 'F');
  doc.setFillColor(...ACCENT);
  doc.rect(0, HEADER_H, w, 0.8, 'F');
  let x = MARGIN;
  if (logo) {
    try {
      const image = doc.getImageProperties(logo);
      const scale = Math.min(40 / image.width, 14 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      doc.addImage(logo, 'PNG', MARGIN, (HEADER_H - height) / 2, width, height);
      x += width + 3;
    } catch { /* a report without the logo is still a report */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CareMetric Intel', x, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('CareMetric Healthcare Advisors', x, 15);
  doc.setFontSize(8);
  doc.text(model.subtitle, w - MARGIN, 10, { align: 'right' });
  doc.text('https://caremetricintel.com/', w - MARGIN, 15, { align: 'right' });
}

function drawPageFooter(doc, model, page, pages) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, h - FOOTER_H + 2, w - MARGIN, h - FOOTER_H + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(`CareMetric Intel  •  ${model.title}  •  Generated ${model.generatedLabel}  •  Confidential`, MARGIN, h - FOOTER_H + 7, { maxWidth: w - MARGIN * 2 - 25 });
  doc.text(`Page ${page} of ${pages}`, w - MARGIN, h - FOOTER_H + 7, { align: 'right' });
  doc.setFontSize(6);
  doc.text(doc.splitTextToSize(model.attribution, w - MARGIN * 2), MARGIN, h - FOOTER_H + 11);
}

/** Lays out the report model as a branded, paginated PDF and downloads it. */
export async function downloadReportPdf(model) {
  const logo = await pdfLogo();
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const bottom = pageH - FOOTER_H - 2;
  let y = 0;

  const newPage = () => {
    const font = doc.getFont();
    const fontSize = doc.getFontSize();
    const textColor = doc.getTextColor();
    doc.addPage();
    drawPageHeader(doc, model, logo);
    doc.setFont(font.fontName, font.fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(textColor);
    y = HEADER_H + 8;
  };
  const ensure = (needed) => {
    if (y + needed > bottom) newPage();
  };

  drawPageHeader(doc, model, logo);
  y = HEADER_H + 12;

  // Title block
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(model.title, contentW);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${model.subtitle}  •  Generated ${model.generatedLabel}`, MARGIN, y);
  y += 8;

  if (model.profile) {
    const ids = model.profile.identifiers;
    if (ids.length) {
      const colW = contentW / 2;
      doc.setFontSize(8.5);
      for (let i = 0; i < ids.length; i += 2) {
        const pair = ids.slice(i, i + 2);
        const lines = pair.map((it) => doc.splitTextToSize(String(it.value), colW - 34));
        const rowH = Math.max(...lines.map((l) => l.length)) * 4 + 1.5;
        ensure(rowH);
        pair.forEach((it, j) => {
          const x = MARGIN + j * colW;
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...MUTED);
          doc.text(it.label, x, y);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...INK);
          doc.text(lines[j], x + 32, y);
        });
        y += rowH;
      }
      y += 3;
    }
    const metrics = model.profile.metrics;
    if (metrics.length) {
      ensure(20);
      const gap = 3;
      const boxW = (contentW - gap * (metrics.length - 1)) / metrics.length;
      metrics.forEach((m, i) => {
        const x = MARGIN + i * (boxW + gap);
        doc.setDrawColor(...RULE);
        doc.setFillColor(...ZEBRA);
        doc.roundedRect(x, y, boxW, 16, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(doc.splitTextToSize(m.label, boxW - 4)[0], x + 2.5, y + 5);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...INK);
        doc.text(String(m.value), x + 2.5, y + 12.5);
      });
      y += 22;
    }
  }

  const heading = (title, count) => {
    ensure(18);
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...INK);
    doc.text(title, MARGIN, y);
    if (count != null) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(`${count} record${count === 1 ? '' : 's'}`, pageW - MARGIN, y, { align: 'right' });
    }
    y += 1.8;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y, pageW - MARGIN, y);
    doc.setLineWidth(0.2);
    y += 5;
  };

  const note = (str) => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(str, contentW);
    ensure(lines.length * 3.6 + 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 3.6 + 2;
  };

  const drawTable = (block) => {
    const cols = block.columns;
    // Column widths follow the longest text in each column, within bounds.
    const weights = cols.map((c) => {
      const longest = Math.max(String(c.label).length, ...block.rows.map((r) => String(r[c.key]?.text ?? '').length));
      return Math.min(Math.max(longest, 4), 40);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * contentW);
    const fontSize = 7.5;
    const lineH = 3.3;

    const headerRow = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize);
      const labels = cols.map((c, i) => doc.splitTextToSize(String(c.label), widths[i] - 3));
      const headerH = Math.max(...labels.map((lines) => lines.length)) * lineH + 2.3;
      doc.setFillColor(...HEAD_FILL);
      doc.rect(MARGIN, y - 3.6, contentW, headerH, 'F');
      doc.setTextColor(...INK);
      let x = MARGIN;
      cols.forEach((c, i) => {
        const tx = c.align === 'right' ? x + widths[i] - 1.5 : x + 1.5;
        doc.text(labels[i], tx, y, { align: c.align === 'right' ? 'right' : 'left' });
        x += widths[i];
      });
      y += headerH - 1.4;
    };

    ensure(12);
    headerRow();
    doc.setFont('helvetica', 'normal');
    block.rows.forEach((row, ri) => {
      doc.setFontSize(fontSize);
      const cells = cols.map((c, i) => doc.splitTextToSize(String(row[c.key]?.text ?? ''), widths[i] - 3));
      const rowH = Math.max(1, ...cells.map((l) => l.length)) * lineH + 1.4;
      if (y + rowH > bottom) {
        newPage();
        headerRow();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
      }
      if (ri % 2 === 1) {
        doc.setFillColor(...ZEBRA);
        doc.rect(MARGIN, y - 3, contentW, rowH, 'F');
      }
      doc.setTextColor(...INK);
      let x = MARGIN;
      cols.forEach((c, i) => {
        const tx = c.align === 'right' ? x + widths[i] - 1.5 : x + 1.5;
        doc.text(cells[i], tx, y, { align: c.align === 'right' ? 'right' : 'left' });
        x += widths[i];
      });
      y += rowH;
      doc.setDrawColor(...RULE);
      doc.line(MARGIN, y - 3, pageW - MARGIN, y - 3);
    });
    y += 3;
  };

  const drawKv = (block) => {
    const colW = contentW / 2;
    doc.setFontSize(9);
    for (let i = 0; i < block.items.length; i += 2) {
      ensure(7);
      block.items.slice(i, i + 2).forEach((it, j) => {
        const x = MARGIN + j * colW;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MUTED);
        doc.text(it.label, x, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        doc.text(String(it.value), x + 40, y);
      });
      y += 6;
    }
    y += 1;
  };

  model.sections.forEach((section) => {
    section.blocks.forEach((block) => {
      heading(block.title, block.kind === 'table' ? block.count : null);
      const empty = block.kind === 'table' ? block.rows.length === 0 : block.items.length === 0;
      if (empty) note(block.emptyText || 'No data on file.');
      else if (block.kind === 'table') drawTable(block);
      else drawKv(block);
      if (block.note) note(block.note);
      y += 3;
    });
  });

  if (model.sources.length) {
    heading('Data Sources');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    model.sources.forEach((src) => {
      const lines = doc.splitTextToSize(`•  ${src}`, contentW);
      ensure(lines.length * 4);
      doc.text(lines, MARGIN, y);
      y += lines.length * 4;
    });
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    drawPageFooter(doc, model, p, pages);
  }

  doc.save(`${reportFileName(model)}.pdf`);
}

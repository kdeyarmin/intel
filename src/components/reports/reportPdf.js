import { jsPDF } from 'jspdf';
import { pdfLogo } from '@/components/exports/exportUtils';
import { blockHasData, reportFileName } from './reportSections';
import { CAREMETRIC_INTEL_NAME, CAREMETRIC_INTEL_WEBSITE } from '@/lib/branding';

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
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(MARGIN - 1, (HEADER_H - height) / 2 - 1, width + 2, height + 2, 1, 1, 'F');
      doc.addImage(logo, 'PNG', MARGIN, (HEADER_H - height) / 2, width, height);
      x += width + 3;
    } catch { /* a report without the logo is still a report */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(CAREMETRIC_INTEL_NAME, x, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Healthcare Provider Intelligence', x, 15);
  doc.setFontSize(8);
  doc.text(model.subtitle, w - MARGIN, 10, { align: 'right' });
  doc.text(CAREMETRIC_INTEL_WEBSITE, w - MARGIN, 15, { align: 'right' });
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
  doc.text(`${CAREMETRIC_INTEL_NAME}  •  ${CAREMETRIC_INTEL_WEBSITE}  •  Confidential`, MARGIN, h - FOOTER_H + 7);
  doc.text(`Page ${page} of ${pages}`, w - MARGIN, h - FOOTER_H + 7, { align: 'right' });
  doc.setFontSize(6);
  doc.text(`Generated ${model.generatedLabel}`, MARGIN, h - FOOTER_H + 10);
  doc.text(doc.splitTextToSize(model.attribution, w - MARGIN * 2), MARGIN, h - FOOTER_H + 13);
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
  const paragraph = (str, { font = 'normal', size = 8.5, color = MUTED, lineH = 4 } = {}) => {
    doc.setFont('helvetica', font);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(str), contentW);
    for (const line of lines) {
      ensure(lineH);
      doc.text(line, MARGIN, y);
      y += lineH;
    }
    y += 2;
  };
  const drawKv = (block, labelW = 34) => {
    const colW = contentW / 2;
    doc.setFontSize(8.5);
    for (let i = 0; i < block.items.length; i += 2) {
      const pair = block.items.slice(i, i + 2);
      const labels = pair.map((it) => {
        doc.setFont('helvetica', 'normal');
        return doc.splitTextToSize(String(it.label), labelW - 3);
      });
      const values = pair.map((it) => {
        doc.setFont('helvetica', 'bold');
        return doc.splitTextToSize(String(it.value), colW - labelW - 4);
      });
      const lines = Math.max(...labels.map((l) => l.length), ...values.map((l) => l.length));
      for (let offset = 0; offset < lines;) {
        ensure(4);
        const count = Math.min(lines - offset, Math.max(1, Math.floor((bottom - y) / 4)));
        pair.forEach((_it, j) => {
          const x = MARGIN + j * colW;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...MUTED);
          const label = labels[j].slice(offset, offset + count);
          if (label.length) doc.text(label, x, y);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...INK);
          const value = values[j].slice(offset, offset + count);
          if (value.length) doc.text(value, x + labelW, y);
        });
        y += count * 4;
        offset += count;
      }
      y += 2;
    }
    y += 2;
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
    paragraph('Executive Overview', { font: 'bold', size: 12, color: INK, lineH: 6 });
    const ids = model.profile.identifiers;
    if (ids.length) {
      drawKv({ items: ids });
    }
    const metrics = model.profile.metrics;
    if (metrics.length) {
      const gap = 3;
      const columns = Math.min(metrics.length, 3);
      const boxW = (contentW - gap * (columns - 1)) / columns;
      for (let start = 0; start < metrics.length; start += columns) {
        const row = metrics.slice(start, start + columns);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        const labels = row.map((m) => doc.splitTextToSize(m.label, boxW - 5));
        const boxH = Math.max(...labels.map((l) => l.length)) * 3.5 + 13;
        ensure(boxH + 3);
        row.forEach((m, i) => {
          const x = MARGIN + i * (boxW + gap);
          doc.setDrawColor(...RULE);
          doc.setFillColor(...ZEBRA);
          doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, 'FD');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(...MUTED);
          doc.text(labels[i], x + 2.5, y + 5);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(...INK);
          doc.text(String(m.value), x + 2.5, y + boxH - 4);
        });
        y += boxH + 4;
      }
      y += 2;
    }
    for (const fact of model.profile.highlights || []) paragraph(fact);
  }

  const heading = (title, count) => {
    ensure(18);
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(title, contentW - (count != null ? 30 : 0));
    ensure(lines.length * 5 + 10);
    doc.text(lines, MARGIN, y);
    if (count != null) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(`${count} record${count === 1 ? '' : 's'}`, pageW - MARGIN, y, { align: 'right' });
    }
    y += (lines.length - 1) * 5 + 1.8;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y, pageW - MARGIN, y);
    doc.setLineWidth(0.2);
    y += 5;
  };

  const note = (str) => {
    paragraph(str, { font: 'italic', size: 8, lineH: 3.6 });
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

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    const headerH = Math.max(...cols.map((c, i) => doc.splitTextToSize(String(c.label), widths[i] - 3).length)) * lineH + 2.3;
    doc.setFont('helvetica', 'normal');
    const firstH = Math.max(1, ...cols.map((c, i) => doc.splitTextToSize(String(block.rows[0]?.[c.key]?.text ?? ''), widths[i] - 3).length)) * lineH + 1.4;
    ensure(Math.min(headerH + firstH + 14, bottom - HEADER_H - 8));
    heading(block.title, block.count);
    headerRow();
    doc.setFont('helvetica', 'normal');
    block.rows.forEach((row, ri) => {
      doc.setFontSize(fontSize);
      const cells = cols.map((c, i) => doc.splitTextToSize(String(row[c.key]?.text ?? ''), widths[i] - 3));
      const lineCount = Math.max(1, ...cells.map((l) => l.length));
      const rowH = lineCount * lineH + 1.4;
      if (y + rowH > bottom && rowH < bottom - HEADER_H - 8 - headerH) {
        newPage();
        headerRow();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
      }
      for (let offset = 0; offset < lineCount;) {
        if (y + lineH + 1.4 > bottom) {
          newPage();
          headerRow();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(fontSize);
        }
        const count = Math.min(lineCount - offset, Math.max(1, Math.floor((bottom - y - 1.4) / lineH)));
        const fragmentH = count * lineH + 1.4;
        if (ri % 2 === 1) {
          doc.setFillColor(...ZEBRA);
          doc.rect(MARGIN, y - 3, contentW, fragmentH, 'F');
        }
        doc.setTextColor(...INK);
        let x = MARGIN;
        cols.forEach((c, i) => {
          const tx = c.align === 'right' ? x + widths[i] - 1.5 : x + 1.5;
          const lines = cells[i].slice(offset, offset + count);
          if (lines.length) doc.text(lines, tx, y, { align: c.align === 'right' ? 'right' : 'left' });
          x += widths[i];
        });
        y += fragmentH;
        offset += count;
      }
      doc.setDrawColor(...RULE);
      doc.line(MARGIN, y - 3, pageW - MARGIN, y - 3);
    });
    y += 3;
  };

  model.sections.forEach((section) => {
    section.blocks.filter(blockHasData).forEach((block) => {
      if (block.kind === 'table') drawTable(block);
      else {
        heading(block.title);
        drawKv(block);
      }
      if (block.note) note(block.note);
      y += 3;
    });
  });
  if (model.availability?.length) {
    heading('Data Availability');
    note('Unavailable or suppressed data does not mean zero activity or poor performance.');
    model.availability.forEach((it) => {
      ensure(12);
      paragraph(it.label, { font: 'bold', size: 8.5, color: INK });
      paragraph(it.message, { size: 8 });
    });
  }

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

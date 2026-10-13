import { jsPDF } from 'jspdf';
import { pdfLogo } from '@/components/exports/exportUtils';
import { reportFileName } from './reportSections';

const MARGIN = 14;
const HEADER_H = 20;
const FOOTER_H = 20;
const NAVY = [15, 23, 42];
const ACCENT = [8, 145, 178];
const INK = [15, 23, 42];
const MUTED = [71, 85, 105];
const RULE = [203, 213, 225];
const HEAD_FILL = [226, 232, 240];
const ZEBRA = [248, 250, 252];

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
  doc.text('caremetricintel.com', w - MARGIN, 15, { align: 'right' });
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

// @ts-ignore — pdfkit ships no bundled types; API used below is stable.
import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import type { Memory } from './types.js';

const CREAM = '#f6ecd9';
const COCOA = '#4a3620';
const UMBER = '#6b4f2d';
const GOLD = '#c9a35e';

function imageBufferFrom(url: string): Buffer | null {
  // pdfkit embeds JPEG/PNG only. Our Flux art is JPEG data URIs; SVG cards are skipped.
  const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(url);
  if (!m) return null;
  try {
    return Buffer.from(m[2], 'base64');
  } catch {
    return null;
  }
}

/** Stream a warm "storybook" PDF of the archive to the HTTP response. */
export function streamStorybookPdf(
  res: Response,
  opts: { title: string; subtitle?: string; memories: Memory[] },
): void {
  const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true });
  doc.pipe(res);

  const pageW = doc.page.width;
  const contentW = pageW - 112;

  // ---- Cover ----
  doc.rect(0, 0, pageW, doc.page.height).fill(CREAM);
  doc.fill(COCOA).font('Times-Bold').fontSize(40).text(opts.title, 56, 220, {
    width: contentW,
    align: 'center',
  });
  doc
    .moveDown(0.5)
    .font('Times-Italic')
    .fontSize(16)
    .fill(UMBER)
    .text(opts.subtitle ?? 'A home for the stories that make us who we are.', {
      width: contentW,
      align: 'center',
    });
  doc.moveDown(2);
  doc
    .font('Times-Roman')
    .fontSize(11)
    .fill(UMBER)
    .text(`Preserved with Storyhouse · ${new Date().toLocaleDateString()}`, {
      width: contentW,
      align: 'center',
    });
  doc
    .fontSize(9)
    .fillColor('#8a6f49')
    .text(
      'These memories belong to the family. Quotes are in her own words; AI-made images are visual interpretations, not photographs.',
      56,
      doc.page.height - 90,
      { width: contentW, align: 'center' },
    );

  // ---- One memory per section ----
  for (const m of opts.memories) {
    doc.addPage();
    doc.rect(0, 0, pageW, doc.page.height).fill(CREAM);
    doc.fill(COCOA);

    doc.font('Times-Bold').fontSize(24).text(m.title, { width: contentW });
    if (m.memory_date_text) {
      doc.moveDown(0.2).font('Times-Italic').fontSize(13).fill(UMBER).text(m.memory_date_text);
    }
    doc.moveDown(0.6);

    // Her words — the immutable quote.
    doc.fill(GOLD).rect(56, doc.y, 4, 0).fill(); // (spacer anchor)
    const quoteY = doc.y;
    doc
      .font('Times-Italic')
      .fontSize(14)
      .fill(COCOA)
      .text(`“${m.original_transcript}”`, 70, quoteY, { width: contentW - 20 });
    doc.rect(56, quoteY, 3, doc.y - quoteY).fill(GOLD);
    doc.fill(COCOA);
    doc.moveDown(0.8);

    // Embedded memory art (Flux JPEG), if present.
    const art = (m.artifacts ?? []).find((a) => imageBufferFrom(a.url));
    if (art) {
      const buf = imageBufferFrom(art.url)!;
      try {
        doc.image(buf, 56, doc.y, { fit: [contentW, 300], align: 'center' });
        doc.moveDown(0.5);
        doc
          .font('Times-Italic')
          .fontSize(9)
          .fill(UMBER)
          .text(art.label, { width: contentW, align: 'center' });
        doc.moveDown(0.6);
      } catch {
        /* skip image on error */
      }
    }

    if (m.summary) {
      doc.font('Times-Roman').fontSize(12).fill('#3a2b1b').text(m.summary, { width: contentW });
      doc.moveDown(0.5);
    }

    // Conflicting / multiple recollections.
    if ((m.recollections?.length ?? 0) > 1) {
      doc.font('Times-Bold').fontSize(11).fill(UMBER).text('Recollections (all kept):');
      for (const r of m.recollections!) {
        doc.font('Times-Roman').fontSize(11).fill('#3a2b1b').text(`• “${r.text}”  (${r.confidence})`, {
          width: contentW,
        });
      }
      doc.moveDown(0.4);
    }

    doc
      .font('Times-Roman')
      .fontSize(9)
      .fill('#8a6f49')
      .text(`Provenance: ${m.provenance} (${m.confidence})`, { width: contentW });
  }

  doc.end();
}

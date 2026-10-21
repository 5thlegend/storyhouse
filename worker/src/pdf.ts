// PDF storybook — her words + embedded memory art, family-owned.
// pdf-lib runs natively in Workers (pdfkit needs a filesystem for its fonts).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { env } from './config.js';
import type { Memory } from './types.js';

const CREAM = rgb(0xf6 / 255, 0xec / 255, 0xd9 / 255);
const COCOA = rgb(0x4a / 255, 0x36 / 255, 0x20 / 255);
const UMBER = rgb(0x6b / 255, 0x4f / 255, 0x2d / 255);
const GOLD = rgb(0xc9 / 255, 0xa3 / 255, 0x5e / 255);
const FAINT = rgb(0x8a / 255, 0x6f / 255, 0x49 / 255);
const BODY = rgb(0x3a / 255, 0x2b / 255, 0x1b / 255);

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;

// Standard PDF fonts are WinAnsi-only; swap curly quotes etc. for safe glyphs.
function safe(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

function wrapLines(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split(/\n/)) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument) {}

  newPage() {
    this.page = this.doc.addPage(A4);
    this.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: CREAM });
    this.y = A4[1] - MARGIN;
  }

  text(
    s: string,
    opts: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; x?: number; width?: number; center?: boolean; gap?: number },
  ) {
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? A4[0] - MARGIN * 2;
    const lh = opts.size * 1.35;
    for (const line of wrapLines(s, opts.font, opts.size, width)) {
      if (this.y - lh < MARGIN) this.newPage();
      const w = opts.font.widthOfTextAtSize(line, opts.size);
      this.page.drawText(line, {
        x: opts.center ? x + (width - w) / 2 : x,
        y: this.y - opts.size,
        size: opts.size,
        font: opts.font,
        color: opts.color ?? COCOA,
      });
      this.y -= lh;
    }
    this.y -= opts.gap ?? 0;
  }
}

async function loadArt(url: string): Promise<{ bytes: Uint8Array; kind: 'jpg' | 'png' } | null> {
  // Our Flux art lives in R2 at /media/art/<id>.jpg; SVG cards are skipped.
  if (url.startsWith('/media/')) {
    const obj = await env.MEDIA.get(url.slice('/media/'.length));
    if (!obj) return null;
    const type = obj.httpMetadata?.contentType ?? '';
    const kind = type.includes('png') ? 'png' : type.includes('jpeg') ? 'jpg' : null;
    return kind ? { bytes: new Uint8Array(await obj.arrayBuffer()), kind } : null;
  }
  const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(url);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, kind: m[1] === 'png' ? 'png' : 'jpg' };
}

export async function buildStorybookPdf(opts: {
  title: string;
  subtitle?: string;
  memories: Memory[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const roman = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const w = new Writer(doc);
  const contentW = A4[0] - MARGIN * 2;

  // ---- Cover ----
  w.newPage();
  w.y = A4[1] - 220;
  w.text(opts.title, { font: bold, size: 40, center: true, gap: 12 });
  w.text(opts.subtitle ?? 'A home for the stories that make us who we are.', {
    font: italic,
    size: 16,
    color: UMBER,
    center: true,
    gap: 28,
  });
  w.text(`Preserved with Storyhouse - ${new Date().toLocaleDateString('en-US')}`, {
    font: roman,
    size: 11,
    color: UMBER,
    center: true,
  });
  w.y = 90;
  w.text(
    'These memories belong to the family. Quotes are in her own words; AI-made images are visual interpretations, not photographs.',
    { font: roman, size: 9, color: FAINT, center: true },
  );

  // ---- One memory per section ----
  for (const m of opts.memories) {
    w.newPage();
    w.text(m.title, { font: bold, size: 24, gap: 2 });
    if (m.memory_date_text) w.text(m.memory_date_text, { font: italic, size: 13, color: UMBER });
    w.y -= 10;

    // Her words — the immutable quote, with a gold rule beside it.
    const quoteTop = w.y;
    w.text(`"${m.original_transcript}"`, { font: italic, size: 14, x: MARGIN + 14, width: contentW - 20 });
    w.page.drawRectangle({ x: MARGIN, y: w.y, width: 3, height: quoteTop - w.y, color: GOLD });
    w.y -= 12;

    // Embedded memory art (Flux JPEG), if present.
    for (const a of m.artifacts ?? []) {
      const art = await loadArt(a.url).catch(() => null);
      if (!art) continue;
      try {
        const img = art.kind === 'png' ? await doc.embedPng(art.bytes) : await doc.embedJpg(art.bytes);
        const scale = Math.min(contentW / img.width, 300 / img.height);
        const iw = img.width * scale;
        const ih = img.height * scale;
        if (w.y - ih < MARGIN + 40) w.newPage();
        w.page.drawImage(img, { x: MARGIN + (contentW - iw) / 2, y: w.y - ih, width: iw, height: ih });
        w.y -= ih + 6;
        w.text(a.label, { font: italic, size: 9, color: UMBER, center: true, gap: 8 });
      } catch {
        /* skip image on error */
      }
      break;
    }

    if (m.summary) w.text(m.summary, { font: roman, size: 12, color: BODY, gap: 8 });

    // Conflicting / multiple recollections — all kept.
    if ((m.recollections?.length ?? 0) > 1) {
      w.text('Recollections (all kept):', { font: bold, size: 11, color: UMBER });
      for (const r of m.recollections!) {
        w.text(`- "${r.text}"  (${r.confidence})`, { font: roman, size: 11, color: BODY });
      }
      w.y -= 6;
    }

    w.text(`Provenance: ${m.provenance} (${m.confidence})`, { font: roman, size: 9, color: FAINT });
  }

  return doc.save();
}

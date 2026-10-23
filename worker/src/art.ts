// Memory art and coloring pages. Open-weight Flux on Workers AI (Flux 2 klein by
// default, within the account's free daily allowance) paints a scene from ONLY
// the details Grandma described. The image is stored in the
// family's own R2 bucket and is always labeled as an interpretation, never a
// photo. If the model is unavailable, a warm SVG "interpretation card" is used.

import { config, env } from './config.js';
import { cryptoId } from './db.js';

export interface MemoryArtResult {
  url: string;
  provider: string;
  prompt: string;
  label: string;
  is_ai_generated: boolean;
}

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
}

function wrap(text: string, max = 42): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 6);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Raw image from the configured Flux model. Flux 2 takes multipart input; Flux 1 takes JSON. */
export async function generateImage(prompt: string, size = 1024): Promise<{ bytes: Uint8Array; mime: string }> {
  const model = config().imageModel;
  let out: { image?: string };
  if (model.includes('flux-2')) {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('width', String(size));
    form.append('height', String(size));
    // Serializing through a Response yields the body stream plus the boundary header.
    const body = new Response(form);
    out = (await env.AI.run(model as any, {
      multipart: { body: body.body, contentType: body.headers.get('content-type') },
    } as any)) as { image?: string };
  } else {
    out = (await env.AI.run(model as any, { prompt, steps: 6 } as any)) as { image?: string };
  }
  if (!out?.image) throw new Error('Workers AI returned no image');
  const bytes = base64ToBytes(out.image);
  // PNG starts with 0x89 'P'; everything else Flux returns is JPEG.
  const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';
  return { bytes, mime };
}

/**
 * A coloring page she can fill with a tap: a handful of BIG shapes and very
 * thick outlines. (Detailed "adult coloring book" pages have hundreds of tiny
 * areas, which is exactly wrong for her.)
 */
export function coloringPrompt(scene: string): string {
  return (
    `Black-and-white line art coloring page, completely uncolored: ${scene}. Only black outlines on a pure ` +
    `white background, with every shape left empty and white for coloring in. Very simple: only 10 to 20 ` +
    `large shapes, very thick bold outlines, big open areas, minimal detail, no small patterns, no textures, ` +
    `no shading, no grey, no color fills, no text, no words, no watermark. Friendly and calm, like a picture book.`
  );
}

export async function generateMemoryArt(opts: { title: string; scene: string }): Promise<MemoryArtResult> {
  const cfg = config();
  // Art always comes from Workers AI, whichever model is talking (Claude or
  // Gemma); only the fully offline setups use the SVG card.
  if (cfg.aiProvider !== 'mock' && cfg.aiProvider !== 'ollama' && env.AI) {
    try {
      const prompt =
        `${opts.scene}. Warm nostalgic painterly illustration, soft golden afternoon light, ` +
        `gentle and timeless, tender family-album feeling, fine brushwork. No text, no words, no watermark.`;
      const img = await generateImage(prompt);
      const key = `art/${cryptoId('art')}.${img.mime === 'image/png' ? 'png' : 'jpg'}`;
      await env.MEDIA.put(key, img.bytes, { httpMetadata: { contentType: img.mime } });
      return {
        url: `/media/${key}`,
        provider: `Cloudflare Workers AI (${cfg.imageModel}, open-weight)`,
        prompt,
        label: 'AI-generated visual interpretation of a memory (open-weight Flux)',
        is_ai_generated: true,
      };
    } catch (err) {
      console.warn('[art] Workers AI failed, falling back to SVG card:', (err as any)?.message);
    }
  }
  return svgInterpretation(opts);
}

function svgInterpretation(opts: { title: string; scene: string }): MemoryArtResult {
  const label = 'AI-generated visual interpretation of a memory';
  const lines = wrap(opts.scene || opts.title);
  const tspans = lines
    .map((l, i) => `<tspan x="400" dy="${i === 0 ? 0 : 40}">${esc(l)}</tspan>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6ecd9"/>
      <stop offset="1" stop-color="#e7cfa6"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="60%">
      <stop offset="0" stop-color="#fff6e6" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#e7cfa6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="500" fill="url(#g)"/>
  <rect width="800" height="500" fill="url(#glow)"/>
  <rect x="24" y="24" width="752" height="452" fill="none" stroke="#9c7a43" stroke-width="2" rx="10" opacity="0.5"/>
  <circle cx="400" cy="150" r="54" fill="#caa35e" opacity="0.5"/>
  <circle cx="400" cy="150" r="30" fill="#fff6e6" opacity="0.7"/>
  <text x="400" y="250" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#4a3620">${tspans}</text>
  <text x="400" y="452" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#6b4f2d" opacity="0.8">${esc(label)}</text>
</svg>`;

  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    provider: 'svg-interpretation (local)',
    prompt: opts.scene,
    label,
    is_ai_generated: true,
  };
}

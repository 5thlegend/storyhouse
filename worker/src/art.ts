// Memory art. The open-weight Flux.1 [schnell] model on Workers AI paints a
// scene from ONLY the details Grandma described. The image is stored in the
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

export async function generateMemoryArt(opts: { title: string; scene: string }): Promise<MemoryArtResult> {
  const cfg = config();
  if (cfg.aiProvider === 'workers-ai' && env.AI) {
    try {
      const prompt =
        `${opts.scene}. Warm nostalgic painterly illustration, soft golden afternoon light, ` +
        `gentle and timeless, tender family-album feeling, fine brushwork. No text, no words, no watermark.`;
      const out = (await env.AI.run(cfg.imageModel as any, { prompt, steps: 6 } as any)) as { image?: string };
      if (!out?.image) throw new Error('Workers AI returned no image');
      const key = `art/${cryptoId('art')}.jpg`;
      await env.MEDIA.put(key, base64ToBytes(out.image), {
        httpMetadata: { contentType: 'image/jpeg' },
      });
      return {
        url: `/media/${key}`,
        provider: `Cloudflare Workers AI (${cfg.imageModel}, open-weight)`,
        prompt,
        label: 'AI-generated visual interpretation of a memory (open-weight Flux.1)',
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

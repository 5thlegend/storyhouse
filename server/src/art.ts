// Memory art. For the MVP the default provider renders a warm, archival SVG
// "interpretation card" from ONLY the details Grandma described — a real,
// viewable image, always explicitly labeled as an interpretation (never a photo).
// A real open/hosted image model can be slotted in behind the same function.

import { config } from './config.js';

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

export interface MemoryArtResult {
  url: string;
  provider: string;
  prompt: string;
  label: string;
  is_ai_generated: boolean;
}

export async function generateMemoryArt(opts: {
  title: string;
  scene: string;
}): Promise<MemoryArtResult> {
  // Preferred path: an OPEN-WEIGHT image model (Flux.1 [schnell]) on Cloudflare
  // Workers AI. Uses ONLY the details she described (§64). Falls back to the
  // local SVG card if unconfigured or on error.
  if (config.imageProvider === 'workers-ai' && config.cfAccountId && config.cfApiToken) {
    try {
      return await generateWithWorkersAI(opts);
    } catch (err) {
      console.warn('[art] Workers AI failed, falling back to SVG card:', (err as any)?.message);
    }
  }

  return svgInterpretation(opts);
}

async function generateWithWorkersAI(opts: {
  title: string;
  scene: string;
}): Promise<MemoryArtResult> {
  const prompt =
    `${opts.scene}. Warm nostalgic painterly illustration, soft golden afternoon light, ` +
    `gentle and timeless, tender family-album feeling, fine brushwork. No text, no words, no watermark.`;

  const url = `https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/ai/run/${config.imageModel}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.cfApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, steps: 6 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Workers AI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { result?: { image?: string }; success?: boolean };
  const b64 = data.result?.image;
  if (!b64) throw new Error('Workers AI returned no image');

  return {
    url: `data:image/jpeg;base64,${b64}`,
    provider: `Cloudflare Workers AI (${config.imageModel}, open-weight)`,
    prompt,
    label: 'AI-generated visual interpretation of a memory (open-weight Flux.1)',
    is_ai_generated: true,
  };
}

function svgInterpretation(opts: { title: string; scene: string }): MemoryArtResult {
  const label = 'AI-generated visual interpretation of a memory';
  const prompt = opts.scene;

  const lines = wrap(opts.scene || opts.title);
  const tspans = lines
    .map(
      (l, i) =>
        `<tspan x="400" dy="${i === 0 ? 0 : 40}">${esc(l)}</tspan>`,
    )
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

  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return { url, provider: 'svg-interpretation (local)', prompt, label, is_ai_generated: true };
}

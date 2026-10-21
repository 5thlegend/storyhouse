// Demo mode only: seed the fictional "Margaret" archive and a small fictional
// album so the whole house can be shown without any real family data.

import { config } from '../config.js';
import { first, run, nowIso, cryptoId, audit } from '../db.js';
import { getProvider } from '../ai/index.js';
import { createMemory, addRecollection } from '../memory/store.js';
import { generateMemoryArt } from '../art.js';
import { addFace, createPerson, createPhoto } from '../house/album.js';
import { MARGARET } from './margaret.js';

let seeding: Promise<void> | null = null;

/** Seed once per isolate when demo mode is on and the vault is empty. */
export function ensureDemoSeed(): Promise<void> {
  if (!config().demoMode) return Promise.resolve();
  seeding ??= (async () => {
    const mem = await first<{ c: number }>(`SELECT COUNT(*) AS c FROM memories`);
    if (!mem?.c) await seedMargaret();
    const pho = await first<{ c: number }>(`SELECT COUNT(*) AS c FROM photos`);
    if (!pho?.c) await seedDemoAlbum();
  })().catch((err) => {
    seeding = null; // let a later request retry
    throw err;
  });
  return seeding;
}

export async function seedMargaret(): Promise<void> {
  const { provider, status } = await getProvider();
  if (!status.openModelOnline) {
    console.warn('[seed] Open model offline — embeddings will be low-quality fallback vectors.');
  }

  for (const s of MARGARET) {
    let embedding: number[] | null = null;
    try {
      embedding = await provider.embed(`${s.title}. ${s.summary} ${s.transcript}`);
    } catch {
      embedding = null;
    }

    const mem = await createMemory({
      title: s.title,
      summary: s.summary,
      original_transcript: s.transcript,
      source_type: 'GRANDMA_DIRECT',
      confidence: 'DIRECT',
      speaker: 'Margaret',
      memory_date_text: s.date_text,
      memory_date_start: s.date_start,
      date_precision: s.date_precision,
      emotions: s.emotions,
      themes: s.themes,
      status: s.status ?? 'saved',
      visibility: 'FAMILY',
      provenance: 'Fictional demo memory, spoken by "Margaret".',
      embedding,
      entities: s.entities,
    });

    // Immutable extra recollections (e.g. the conflicting Maple Street date).
    for (const r of s.extraRecollections ?? []) {
      await addRecollection(mem.id, r.field, r.text, r.confidence);
    }

    // Visual memory → memory art artifact (clearly labeled interpretation).
    if (s.makeArt && s.visual_scene) {
      const art = await generateMemoryArt({ title: s.title, scene: s.visual_scene });
      await run(
        `INSERT INTO artifacts (id, memory_id, kind, label, is_ai_generated, url, prompt, provider, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        cryptoId('art'),
        mem.id,
        'image',
        art.label,
        1,
        art.url,
        art.prompt,
        art.provider,
        nowIso(),
      );
    }
  }

  // A sample family question (architecture demo).
  await run(
    `INSERT INTO questions (id, asked_by, question, about_person, status, created_at) VALUES (?,?,?,?,?,?)`,
    cryptoId('q'),
    'Granddaughter',
    'What was your mother like when you were five?',
    'Mother',
    'open',
    nowIso(),
  );

  await audit('seed.margaret', undefined, undefined, `${MARGARET.length} memories`);
}

// ---------- the fictional demo album ----------
// Simple illustrated "snapshots" (SVG), never real faces. Each is labeled as
// demo art so nobody mistakes it for a real family photo.

interface Figure {
  x: number; // center, 0–1200
  y: number; // head center, 0–900
  scale?: number;
  shirt: string;
  hair: string;
}

function snapshot(sky: [string, string], ground: string, figures: Figure[], extras = ''): string {
  const people = figures
    .map((f) => {
      const s = f.scale ?? 1;
      const head = 62 * s;
      return `<g>
  <rect x="${f.x - 95 * s}" y="${f.y + head * 0.9}" width="${190 * s}" height="${330 * s}" rx="${80 * s}" fill="${f.shirt}"/>
  <circle cx="${f.x}" cy="${f.y}" r="${head}" fill="#e9c4a0"/>
  <path d="M${f.x - head} ${f.y - 6 * s} a${head} ${head} 0 0 1 ${head * 2} 0 q${-head} ${-34 * s} ${-head * 2} 0z" fill="${f.hair}"/>
  <circle cx="${f.x - 22 * s}" cy="${f.y + 6 * s}" r="${6 * s}" fill="#4a3620"/>
  <circle cx="${f.x + 22 * s}" cy="${f.y + 6 * s}" r="${6 * s}" fill="#4a3620"/>
  <path d="M${f.x - 22 * s} ${f.y + 30 * s} q${22 * s} ${18 * s} ${44 * s} 0" stroke="#4a3620" stroke-width="${5 * s}" fill="none" stroke-linecap="round"/>
</g>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
  <rect width="1200" height="900" fill="url(#sky)"/>
  <rect y="640" width="1200" height="260" fill="${ground}"/>
  ${extras}
  ${people}
</svg>`;
}

const DEMO_PEOPLE = [
  { key: 'ellie', name: 'Ellie', relation: 'your granddaughter' },
  { key: 'tom', name: 'Tom', relation: 'your son' },
  { key: 'harold', name: 'Harold', relation: 'your husband' },
  { key: 'rosie', name: 'Rosie', relation: 'your great-granddaughter' },
] as const;

const DEMO_PHOTOS: {
  caption: string;
  when: string;
  svg: string;
  faces: { who: (typeof DEMO_PEOPLE)[number]['key']; x: number; y: number }[];
}[] = [
  {
    caption: 'Ellie’s graduation day',
    when: 'Spring 2019',
    svg: snapshot(['#bcd9ef', '#f3ead6'], '#8fae6b', [
      { x: 420, y: 360, shirt: '#2f3e66', hair: '#6b4a2b' },
      { x: 760, y: 330, shirt: '#7d3c52', hair: '#a8743e' },
    ], '<rect x="700" y="250" width="120" height="22" fill="#222"/><rect x="752" y="230" width="16" height="26" fill="#222"/>'),
    faces: [
      { who: 'tom', x: 0.35, y: 0.4 },
      { who: 'ellie', x: 0.633, y: 0.367 },
    ],
  },
  {
    caption: 'Sunday dinner at the lake house',
    when: 'Summer 1987',
    svg: snapshot(['#f6d9a8', '#f3ead6'], '#7a8f9e', [
      { x: 360, y: 380, shirt: '#c9a35e', hair: '#d8d2c4' },
      { x: 600, y: 360, shirt: '#3e6b55', hair: '#5a4632' },
      { x: 840, y: 390, shirt: '#b8603a', hair: '#e2d9c7', scale: 0.95 },
    ]),
    faces: [
      { who: 'harold', x: 0.3, y: 0.422 },
      { who: 'tom', x: 0.5, y: 0.4 },
    ],
  },
  {
    caption: 'Rosie’s first birthday',
    when: 'October 2024',
    svg: snapshot(['#f4c9c9', '#f6ecd9'], '#d8b48a', [
      { x: 470, y: 330, shirt: '#7d3c52', hair: '#a8743e' },
      { x: 720, y: 520, shirt: '#e8a0b4', hair: '#c9a35e', scale: 0.6 },
    ], '<rect x="820" y="560" width="200" height="90" rx="12" fill="#fff6e6"/><rect x="915" y="520" width="10" height="44" fill="#c9a35e"/>'),
    faces: [
      { who: 'ellie', x: 0.392, y: 0.367 },
      { who: 'rosie', x: 0.6, y: 0.578 },
    ],
  },
];

export async function seedDemoAlbum(): Promise<void> {
  const ids: Record<string, string> = {};
  for (const p of DEMO_PEOPLE) ids[p.key] = (await createPerson(p.name, p.relation)).id;

  for (const d of DEMO_PHOTOS) {
    const photo = await createPhoto({
      bytes: new TextEncoder().encode(d.svg),
      mime: 'image/svg+xml',
      width: 1200,
      height: 900,
      kind: 'family_art',
      made_by: 'the Storyhouse demo (fictional family)',
      caption: d.caption,
      when_text: d.when,
      status: 'published',
      created_by: 'demo-seed',
    });
    for (const f of d.faces) await addFace(photo.id, ids[f.who], f.x, f.y, 0.07);
  }
  await audit('seed.demo_album', undefined, undefined, `${DEMO_PHOTOS.length} photos`);
}

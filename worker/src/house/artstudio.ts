// The Art Studio on her iPad. Two sources, one library:
//   • pages the family made ahead (e.g. on Higgsfield Unlimited) and published;
//   • new pages Flux draws on the spot, from a short list of ideas built from her
//     own memories. She never types a prompt, so what gets drawn stays gentle.
// What she paints is saved for the family to see ("Made by Grandma").

import { config } from '../config.js';
import { all, first, run, nowIso, cryptoId, audit } from '../db.js';
import { coloringPrompt, generateImage } from '../art.js';
import { createPhoto, listPhotos, type AlbumPhoto } from './album.js';

/** On-the-spot pictures per day, across her iPads. Keeps well inside the free allowance. */
export const DAILY_NEW_PICTURES = 12;

export interface ArtIdea {
  id: string; // "mem:<memory id>" or "theme:<key>"
  title: string; // shown to her in big type
}

// Always-available gentle subjects, in case her archive is still small.
const THEMES: Record<string, { title: string; scene: string }> = {
  flowers: { title: 'A vase of flowers', scene: 'a big vase of garden flowers on a kitchen table' },
  birds: { title: 'Birds in a tree', scene: 'two songbirds sitting on a leafy branch' },
  kitchen: { title: 'A cozy kitchen', scene: 'a cozy old-fashioned kitchen with a pie cooling by the window' },
  garden: { title: 'A summer garden', scene: 'a summer vegetable garden with a watering can and sunflowers' },
};

/**
 * Up to six ideas: her own memories first, then gentle themes. Only memories
 * with something you can draw (a place, object, recipe, home, vehicle) qualify;
 * "her father's advice" would make a strange picture.
 */
export async function artIdeas(): Promise<ArtIdea[]> {
  const mems = await all<{ id: string; title: string }>(
    `SELECT m.id, m.title FROM memories m
     WHERE m.status = 'saved' AND m.visibility IN ('FAMILY','PUBLIC')
       AND EXISTS (
         SELECT 1 FROM memory_entities me JOIN entities e ON e.id = me.entity_id
         WHERE me.memory_id = m.id AND e.kind IN ('place','object','recipe','home','vehicle')
       )
     ORDER BY m.created_at DESC LIMIT 4`,
  );
  const ideas: ArtIdea[] = mems.map((m) => ({ id: `mem:${m.id}`, title: m.title }));
  for (const [key, t] of Object.entries(THEMES)) {
    if (ideas.length >= 6) break;
    ideas.push({ id: `theme:${key}`, title: t.title });
  }
  return ideas;
}

async function sceneFor(ideaId: string): Promise<{ title: string; scene: string } | null> {
  if (ideaId.startsWith('theme:')) return THEMES[ideaId.slice(6)] ?? null;
  if (ideaId.startsWith('mem:')) {
    const m = await first<{ title: string; summary: string }>(
      `SELECT title, summary FROM memories WHERE id = ? AND visibility IN ('FAMILY','PUBLIC')`,
      ideaId.slice(4),
    );
    // Only the derived summary/title — never her raw words — goes into the prompt.
    return m ? { title: m.title, scene: m.summary || m.title } : null;
  }
  return null;
}

export async function picturesLeftToday(): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const r = await first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM art_generations WHERE created_at >= ?`,
    since.toISOString(),
  );
  return Math.max(0, DAILY_NEW_PICTURES - (r?.n ?? 0));
}

export class NoPictureNow extends Error {}

/** Draw a new coloring page on the spot. It joins the library so she can return to it. */
export async function drawNewPage(ideaId: string, deviceId: string | null): Promise<AlbumPhoto> {
  if ((await picturesLeftToday()) <= 0) throw new NoPictureNow('daily allowance used');
  const idea = await sceneFor(ideaId);
  if (!idea) throw new NoPictureNow('unknown idea');

  const img = await generateImage(coloringPrompt(idea.scene));
  const photo = await createPhoto({
    bytes: img.bytes,
    mime: img.mime,
    width: 1024,
    height: 1024,
    kind: 'ai_art',
    made_by: 'Storyhouse',
    caption: idea.title,
    status: 'published',
    collection: 'coloring',
    created_by: 'ipad',
  });
  await run(
    `INSERT INTO art_generations (id, device_id, idea, photo_id, created_at) VALUES (?,?,?,?,?)`,
    cryptoId('gen'),
    deviceId,
    ideaId,
    photo.id,
    nowIso(),
  );
  await audit('art.generate', 'photo', photo.id, `${config().imageModel} · ${ideaId}`);
  return photo;
}

/** Save what she painted. Published straight away so the family can see it. */
export async function saveHerArt(input: {
  bytes: ArrayBuffer;
  mime: string;
  width: number | null;
  height: number | null;
  caption: string;
  painter: string;
}): Promise<AlbumPhoto> {
  return createPhoto({
    bytes: input.bytes,
    mime: input.mime,
    width: input.width,
    height: input.height,
    kind: 'family_art',
    made_by: input.painter,
    caption: input.caption,
    status: 'published',
    collection: 'her_art',
    created_by: 'ipad',
  });
}

export async function artStudio() {
  const [library, mine, ideas, left] = await Promise.all([
    listPhotos({ includeDrafts: false, collection: 'coloring' }),
    listPhotos({ includeDrafts: false, collection: 'her_art' }),
    artIdeas(),
    picturesLeftToday(),
  ]);
  return { library, mine, ideas, canDrawNew: left > 0 };
}

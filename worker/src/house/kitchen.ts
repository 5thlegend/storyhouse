// Her Kitchen. Recipes arrive three ways — her own voice, a photo of her
// handwritten card, or a classic family has approved — and always as DRAFTS the
// family reviews before they reach her iPad. Honesty rails:
//   • nothing she didn't say (or the card didn't show) is ever filled in;
//   • every ingredient and step carries where it came from;
//   • her recording, transcript and card photo are kept, unedited.

import { config, env } from '../config.js';
import { all, first, run, nowIso, cryptoId, audit } from '../db.js';
import { ClaudeProvider } from '../ai/claude.js';
import { WorkersAIProvider } from '../ai/workersai.js';
import { consolidate } from '../memory/pipeline.js';
import { generateImage } from '../art.js';
import { transcribe } from '../ai/whisper.js';
import { createPhoto } from './album.js';
import { CLASSIC_RECIPES } from './classics.js';

export type Source = 'her_words' | 'card' | 'family' | 'classic' | 'safety';
export type Care = 'oven_on' | 'stove_on' | 'knife' | 'hot' | 'heat_off' | null;

export interface Recipe {
  id: string;
  title: string;
  origin: 'her_voice' | 'card' | 'classic';
  status: 'draft' | 'published';
  story: string | null;
  transcript: string | null;
  her_voice_url: string | null;
  card_image_url: string | null;
  image_url: string | null;
  servings: string | null;
  ingredients: { text: string; amount: string | null; source: Source }[];
  steps: { text: string; care: Care; timer_minutes: number | null; source: Source }[];
  cook_mode: 'together' | 'own';
  helper: string | null;
  created_at: string;
  published_at: string | null;
}

const media = (key: string | null) => (key ? `/media/${key}` : null);
const J = <T>(s: unknown, fallback: T): T => {
  try {
    return s ? (JSON.parse(String(s)) as T) : fallback;
  } catch {
    return fallback;
  }
};

function rowToRecipe(r: any): Recipe {
  return {
    id: r.id,
    title: r.title,
    origin: r.origin,
    status: r.status,
    story: r.story,
    transcript: r.transcript,
    her_voice_url: media(r.her_voice_key),
    card_image_url: media(r.card_image_key),
    image_url: media(r.image_key),
    servings: r.servings,
    ingredients: J(r.ingredients, []),
    steps: J(r.steps, []),
    cook_mode: r.cook_mode,
    helper: r.helper,
    created_at: r.created_at,
    published_at: r.published_at,
  };
}

export async function listRecipes(opts: { includeDrafts: boolean }): Promise<Recipe[]> {
  const rows = await all(
    opts.includeDrafts
      ? `SELECT * FROM recipes ORDER BY (status = 'draft') DESC, COALESCE(published_at, created_at) DESC`
      : `SELECT * FROM recipes WHERE status = 'published' ORDER BY (origin = 'classic'), title COLLATE NOCASE`,
  );
  return rows.map(rowToRecipe);
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const r = await first(`SELECT * FROM recipes WHERE id = ?`, id);
  return r ? rowToRecipe(r) : null;
}

async function insertRecipe(input: {
  title: string;
  origin: Recipe['origin'];
  story?: string | null;
  transcript?: string | null;
  her_voice_key?: string | null;
  her_voice_mime?: string | null;
  card_image_key?: string | null;
  servings?: string | null;
  ingredients: Recipe['ingredients'];
  steps: Recipe['steps'];
  created_by: string;
}): Promise<Recipe> {
  const id = cryptoId('rcp');
  const now = nowIso();
  await run(
    `INSERT INTO recipes (id, title, origin, status, story, transcript, her_voice_key, her_voice_mime,
       card_image_key, servings, ingredients, steps, cook_mode, created_by, created_at, updated_at)
     VALUES (?,?,?,'draft',?,?,?,?,?,?,?,?,'together',?,?,?)`,
    id,
    input.title.trim() || 'A recipe',
    input.origin,
    input.story ?? null,
    input.transcript ?? null,
    input.her_voice_key ?? null,
    input.her_voice_mime ?? null,
    input.card_image_key ?? null,
    input.servings ?? null,
    JSON.stringify(input.ingredients),
    JSON.stringify(withSafetyStep(input.steps)),
    input.created_by,
    now,
    now,
  );
  await audit('recipe.create', 'recipe', id, input.origin);
  return (await getRecipe(id))!;
}

/** If anything heats up, the last step is always turning it off (marked as a safety step, not her words). */
function withSafetyStep(steps: Recipe['steps']): Recipe['steps'] {
  const heats = steps.some((s) => s.care === 'oven_on' || s.care === 'stove_on');
  const last = steps[steps.length - 1];
  if (!heats || last?.care === 'heat_off') return steps;
  const what = steps.some((s) => s.care === 'oven_on') ? 'oven' : 'stove';
  return [...steps, { text: `Turn the ${what} off.`, care: 'heat_off', timer_minutes: null, source: 'safety' }];
}

// ---------- AI drafting (Claude, with Gemma as the fallback for text) ----------
const claude = new ClaudeProvider();
const gemma = new WorkersAIProvider();

const RECIPE_RULES = `RULES (never break these):
- Use ONLY what is in the source. Never add an ingredient, amount, temperature, time or step that isn't there.
- If an amount is missing, set "amount" to null — the family will fill it in. Keep her own phrasing ("a good handful of oats").
- "steps": short, plain sentences in the order given, addressed to her ("Mix the oats and flour.").
- "care" for each step: "oven_on" when the oven is turned on or preheated; "stove_on" when a burner is used;
  "knife" for cutting or chopping; "hot" for handling hot pans, boiling water or taking things out of the oven;
  "heat_off" when the oven or stove is turned off; otherwise null.
- "timer_minutes": only when a time is given; otherwise null.
- "title": the name she uses for the dish, or a plain name for it.
- "story": any memory or feeling she shared about the dish, quoted in her own words; null if none.`;

const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    story: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    servings: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string' }, amount: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
        required: ['text', 'amount'],
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          care: { anyOf: [{ type: 'string', enum: ['oven_on', 'stove_on', 'knife', 'hot', 'heat_off'] }, { type: 'null' }] },
          timer_minutes: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        },
        required: ['text', 'care', 'timer_minutes'],
      },
    },
  },
  required: ['title', 'story', 'servings', 'ingredients', 'steps'],
};

const FROM_SPEECH = `You turn an elderly woman's spoken description of how she makes a dish into a recipe draft that her family will review.
${RECIPE_RULES}
- Speech is messy: ignore filler and repetition, but do not "improve" the recipe.`;

const FROM_CARD = `You read a photo of a handwritten or printed recipe card and turn it into a recipe draft that her family will review.
${RECIPE_RULES}
- Transcribe faithfully. If a word can't be read, write [unclear] in its place rather than guessing.`;

type Drafted = {
  title: string;
  story: string | null;
  servings: string | null;
  ingredients: { text: string; amount: string | null }[];
  steps: { text: string; care: Care; timer_minutes: number | null }[];
};

function useClaude(): boolean {
  return config().aiProvider === 'anthropic' && !!env.ANTHROPIC_API_KEY;
}

async function draftFromSpeech(transcript: string): Promise<Drafted | null> {
  if (useClaude()) {
    try {
      return await claude.structured(FROM_SPEECH, transcript, RECIPE_SCHEMA);
    } catch (err) {
      console.warn('[kitchen] Claude draft failed; trying Gemma:', (err as any)?.message);
    }
  }
  try {
    return await gemma.json(`${FROM_SPEECH}
${SHAPE}`, transcript);
  } catch (err) {
    console.warn('[kitchen] Gemma draft failed:', (err as any)?.message);
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Gemma isn't schema-locked, so spell the exact shape out for it.
const SHAPE = `JSON shape (exactly these keys):
{"title": string, "story": string|null, "servings": string|null,
 "ingredients": [{"text": string, "amount": string|null}],
 "steps": [{"text": string, "care": "oven_on"|"stove_on"|"knife"|"hot"|"heat_off"|null, "timer_minutes": integer|null}]}`;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Normalize a draft, tolerating the shapes a model might drift into (plain strings, "name"/"item" keys). */
function clean(d: any, source: Source) {
  const careOk = new Set(['oven_on', 'stove_on', 'knife', 'hot', 'heat_off']);
  const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  return {
    title: str(d?.title),
    story: str(d?.story) || null,
    servings: str(d?.servings) || null,
    ingredients: list(d?.ingredients)
      .map((i) =>
        typeof i === 'string'
          ? { text: i.trim(), amount: null }
          : { text: str(i?.text ?? i?.name ?? i?.item ?? i?.ingredient), amount: str(i?.amount ?? i?.quantity) || null },
      )
      .filter((i) => i.text)
      .map((i) => ({ ...i, source })),
    steps: list(d?.steps)
      .map((s) => (typeof s === 'string' ? { text: s } : s))
      .map((s: any) => ({ text: str(s?.text ?? s?.instruction ?? s?.step), care: s?.care, timer_minutes: s?.timer_minutes }))
      .filter((s) => s.text)
      .map((s) => ({
        text: s.text,
        care: (careOk.has(s.care) ? s.care : null) as Care,
        timer_minutes: Number.isInteger(s.timer_minutes) && s.timer_minutes > 0 ? (s.timer_minutes as number) : null,
        source,
      })),
  };
}

// ---------- the three ways in ----------

/**
 * She told a recipe out loud on her iPad (and said yes, keep it). Her recording
 * is always kept, even if transcription or drafting fails, so nothing is lost.
 */
export async function recipeFromHerVoice(audio: ArrayBuffer, mime: string): Promise<Recipe> {
  const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : 'm4a';
  const voiceKey = `voices/${cryptoId('tell')}.${ext}`;
  await env.MEDIA.put(voiceKey, audio, { httpMetadata: { contentType: mime } });

  let transcript = '';
  try {
    transcript = await transcribe(audio);
  } catch (err) {
    console.warn('[kitchen] transcription failed:', (err as any)?.message);
  }

  const d = transcript ? clean(await draftFromSpeech(transcript), 'her_words') : clean(null, 'her_words');
  const recipe = await insertRecipe({
    title: d.title || 'A recipe she told',
    origin: 'her_voice',
    story: d.story,
    transcript: transcript || null,
    her_voice_key: voiceKey,
    her_voice_mime: mime,
    servings: d.servings,
    ingredients: d.ingredients,
    steps: d.steps,
    created_by: 'ipad',
  });

  // Her telling is also a memory in her Vault (best effort; the recipe is already safe).
  if (transcript) {
    try {
      const mem = await consolidate(transcript, { speaker: 'Grandma' });
      if (mem) await run(`UPDATE recipes SET memory_id = ? WHERE id = ?`, mem.id, recipe.id);
    } catch {
      /* the recipe is saved either way */
    }
  }
  return recipe;
}

/** A photo of her handwritten card. The card image is kept as a keepsake next to the typed version. */
export async function recipeFromCard(image: ArrayBuffer, mime: 'image/jpeg' | 'image/png'): Promise<Recipe> {
  const key = `photos/${cryptoId('card')}.${mime === 'image/png' ? 'png' : 'jpg'}`;
  await env.MEDIA.put(key, image, { httpMetadata: { contentType: mime } });

  let drafted: Drafted | null = null;
  const pic = { base64: toBase64(new Uint8Array(image)), mime };
  if (useClaude()) {
    try {
      drafted = await claude.structured(FROM_CARD, 'Read this recipe card.', RECIPE_SCHEMA, pic);
    } catch (err) {
      console.warn('[kitchen] Claude card reading failed; trying Gemma:', (err as any)?.message);
    }
  }
  if (!drafted) {
    try {
      drafted = await gemma.jsonWithImage(`${FROM_CARD}
${SHAPE}`, 'Read this recipe card.', pic);
    } catch (err) {
      console.warn('[kitchen] Gemma card reading failed:', (err as any)?.message);
    }
  }
  const d = clean(drafted, 'card');
  return insertRecipe({
    title: d.title || 'Recipe card',
    origin: 'card',
    story: d.story,
    card_image_key: key,
    servings: d.servings,
    ingredients: d.ingredients,
    steps: d.steps,
    created_by: 'studio',
  });
}

/** Add the classics that aren't on the shelf yet, as drafts for family to approve. */
export async function addClassics(): Promise<number> {
  const existing = new Set((await all<{ title: string }>(`SELECT title FROM recipes WHERE origin = 'classic'`)).map((r) => r.title));
  let added = 0;
  for (const c of CLASSIC_RECIPES) {
    if (existing.has(c.title)) continue;
    await insertRecipe({ ...c, origin: 'classic', created_by: 'studio' });
    added++;
  }
  return added;
}

// ---------- family edits ----------
export async function updateRecipe(
  id: string,
  patch: Partial<Pick<Recipe, 'title' | 'story' | 'servings' | 'ingredients' | 'steps' | 'cook_mode' | 'helper' | 'status'>>,
): Promise<Recipe | null> {
  const cur = await first(`SELECT * FROM recipes WHERE id = ?`, id);
  if (!cur) return null;
  const status = patch.status ?? cur.status;
  const now = nowIso();
  await run(
    `UPDATE recipes SET title = ?, story = ?, servings = ?, ingredients = ?, steps = ?, cook_mode = ?, helper = ?,
       status = ?, published_at = ?, updated_at = ? WHERE id = ?`,
    patch.title?.trim() || cur.title,
    patch.story !== undefined ? patch.story : cur.story,
    patch.servings !== undefined ? patch.servings : cur.servings,
    patch.ingredients ? JSON.stringify(patch.ingredients) : cur.ingredients,
    patch.steps ? JSON.stringify(withSafetyStep(patch.steps)) : cur.steps,
    patch.cook_mode ?? cur.cook_mode,
    patch.helper !== undefined ? patch.helper?.trim() || null : cur.helper,
    status,
    status === 'published' ? (cur.published_at ?? now) : null,
    now,
    id,
  );
  if (patch.status && patch.status !== cur.status) await audit(`recipe.${patch.status}`, 'recipe', id);
  return getRecipe(id);
}

export async function deleteRecipe(id: string): Promise<void> {
  const cur = await first(`SELECT her_voice_key, card_image_key, image_key FROM recipes WHERE id = ?`, id);
  if (!cur) return;
  await run(`DELETE FROM recipes WHERE id = ?`, id);
  await env.MEDIA.delete([cur.her_voice_key, cur.card_image_key, cur.image_key].filter(Boolean));
  await audit('recipe.delete', 'recipe', id);
}

async function setImage(id: string, bytes: ArrayBuffer | Uint8Array, mime: string): Promise<Recipe | null> {
  const cur = await first(`SELECT image_key FROM recipes WHERE id = ?`, id);
  if (!cur) return null;
  const key = `photos/${cryptoId('dish')}.${mime === 'image/png' ? 'png' : 'jpg'}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mime } });
  await run(`UPDATE recipes SET image_key = ?, updated_at = ? WHERE id = ?`, key, nowIso(), id);
  if (cur.image_key) await env.MEDIA.delete(cur.image_key);
  return getRecipe(id);
}

export const uploadRecipeImage = setImage;

/** A warm painted picture of the dish (open Flux). Only the dish name goes into the prompt. */
export async function paintRecipeImage(id: string): Promise<Recipe | null> {
  const r = await getRecipe(id);
  if (!r) return null;
  const img = await generateImage(
    `A homemade ${r.title} on a vintage plate on a sunlit kitchen table, warm painterly illustration, ` +
      `soft golden light, cozy and timeless, vegetarian food only, no people, no text, no words, no watermark.`,
  );
  return setImage(id, img.bytes, img.mime);
}

/** "Take a picture of it!" — her photo of what she made goes straight into the family album. */
export async function saveCookedPhoto(id: string, bytes: ArrayBuffer, mime: string, width: number | null, height: number | null) {
  const r = await getRecipe(id);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return createPhoto({
    bytes,
    mime,
    width,
    height,
    kind: 'photo',
    caption: `${r?.title ?? 'Something she made'}, made by Grandma`,
    when_text: today,
    status: 'published',
    collection: 'album',
    created_by: 'ipad',
  });
}

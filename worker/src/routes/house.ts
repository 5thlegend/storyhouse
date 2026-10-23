// Grandma's House API: the front door (session), her iPad (album + Today), and
// the Family Studio where family uploads, records, and publishes to her.

import { Hono } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { getProvider } from '../ai/index.js';
import {
  allow,
  createPairingCode,
  listDevices,
  logout,
  recordFailedAttempt,
  redeemPairingCode,
  revokeDevice,
  tooManyAttempts,
  tryPasscode,
  type HonoEnv,
} from '../auth.js';
import {
  AlbumRuleError,
  addFace,
  clearPersonVoice,
  clearPhotoVoice,
  createPerson,
  createPhoto,
  deletePerson,
  deletePhoto,
  getToday,
  listPeople,
  listPhotos,
  removeFace,
  setPersonVoice,
  setPhotoVoice,
  setToday,
  updatePerson,
  updatePhoto,
} from '../house/album.js';
import {
  NoPictureNow,
  artStudio,
  discardPainting,
  drawNewPage,
  keepPainting,
  paintFromDrawing,
  paintFromWords,
  saveHerArt,
} from '../house/artstudio.js';
import { transcribe } from '../ai/whisper.js';
import {
  addClassics,
  deleteRecipe,
  getRecipe,
  listRecipes,
  paintRecipeImage,
  recipeFromCard,
  recipeFromHerVoice,
  saveCookedPhoto,
  updateRecipe,
  uploadRecipeImage,
} from '../house/kitchen.js';

export const house = new Hono<HonoEnv>();

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---------- the front door ----------
house.get('/session', (c) => {
  const cfg = config();
  return c.json({
    role: c.get('role'),
    demoMode: cfg.demoMode,
    // Lets the lock screen say "this Storyhouse isn't set up yet" instead of
    // silently rejecting every passcode.
    configured: !!(cfg.studioPasscode && cfg.sessionSecret),
    familyViewEnabled: !!cfg.familyPasscode,
  });
});

const passcodeSchema = z.object({ passcode: z.string().min(1).max(200) });
house.post('/session/unlock', async (c) => {
  if (await tooManyAttempts(c)) {
    return c.json({ error: 'Too many tries. Please wait 15 minutes and try again.' }, 429);
  }
  const { passcode } = passcodeSchema.parse(await c.req.json());
  const role = await tryPasscode(c, passcode);
  if (!role) {
    await recordFailedAttempt(c);
    return c.json({ error: 'That passcode did not match.' }, 401);
  }
  return c.json({ role });
});

const pairSchema = z.object({ code: z.string().min(4).max(40) });
house.post('/session/pair', async (c) => {
  if (await tooManyAttempts(c)) {
    return c.json({ error: 'Too many tries. Please wait 15 minutes and try again.' }, 429);
  }
  const { code } = pairSchema.parse(await c.req.json());
  if (!(await redeemPairingCode(c, code))) {
    await recordFailedAttempt(c);
    return c.json({ error: 'That code didn’t work. Codes last 24 hours and work once.' }, 401);
  }
  return c.json({ role: 'grandma' });
});

house.post('/session/logout', (c) => {
  logout(c);
  return c.json({ ok: true });
});

house.get('/health', allow('studio', 'family', 'grandma'), async (c) => {
  const { status } = await getProvider();
  return c.json({ ok: true, demoMode: config().demoMode, ai: status });
});

// ---------- her iPad (and family can look too) ----------
house.get('/house/album', allow('grandma', 'studio', 'family'), async (c) =>
  c.json({ photos: await listPhotos({ includeDrafts: false, collection: 'album' }) }),
);

// ---------- her Art Studio ----------
house.get('/house/art', allow('grandma', 'studio', 'family'), async (c) => c.json(await artStudio()));

const ideaSchema = z.object({ idea: z.string().regex(/^(mem|theme):[\w-]+$/) });
house.post('/house/art/new', allow('grandma', 'studio'), async (c) => {
  const { idea } = ideaSchema.parse(await c.req.json());
  try {
    return c.json({ photo: await drawNewPage(idea, c.get('deviceId')) });
  } catch (err) {
    // No error screen for her: the iPad quietly offers a page from the library.
    if (!(err instanceof NoPictureNow)) console.warn('[art] new page failed:', (err as any)?.message);
    return c.json({ photo: null });
  }
});

// She says what she'd like; Whisper turns it into words she can check before painting.
house.post('/house/art/listen', allow('grandma', 'studio'), async (c) => {
  const mime = audioMime(c);
  if (!mime) return c.json({ error: 'Unsupported audio format.' }, 415);
  if (tooBig(c, MAX_AUDIO_BYTES)) return c.json({ error: 'That recording is too long.' }, 413);
  try {
    return c.json({ text: await transcribe(await c.req.arrayBuffer()) });
  } catch (err) {
    console.warn('[art] listening failed:', (err as any)?.message);
    return c.json({ text: '' });
  }
});

const paintWordsSchema = z.object({
  text: z.string().max(300).optional(),
  idea: z.string().regex(/^(mem|theme):[\w-]+$/).optional(),
});
house.post('/house/art/paint', allow('grandma', 'studio'), async (c) => {
  const input = paintWordsSchema.parse(await c.req.json());
  try {
    return c.json({ painting: await paintFromWords(input, c.get('deviceId')) });
  } catch (err) {
    if (!(err instanceof NoPictureNow)) console.warn('[art] paint failed:', (err as any)?.message);
    return c.json({ painting: null });
  }
});

// Her drawing (PNG, under 512px) → a painting with the same subject and layout.
house.post('/house/art/paint-drawing', allow('grandma', 'studio'), async (c) => {
  const mime = c.req.header('content-type') ?? '';
  if (!/^image\/(png|jpeg)$/.test(mime)) return c.json({ error: 'Unsupported image.' }, 415);
  if (tooBig(c, 2 * 1024 * 1024)) return c.json({ error: 'That drawing is too large.' }, 413);
  try {
    const painting = await paintFromDrawing(await c.req.arrayBuffer(), mime, c.req.query('said') ?? '', c.get('deviceId'));
    return c.json({ painting });
  } catch (err) {
    if (!(err instanceof NoPictureNow)) console.warn('[art] drawing paint failed:', (err as any)?.message);
    return c.json({ painting: null });
  }
});

const keepSchema = z.object({ key: z.string().max(120), caption: z.string().max(120) });
house.post('/house/art/keep', allow('grandma', 'studio'), async (c) => {
  const { key, caption } = keepSchema.parse(await c.req.json());
  try {
    return c.json({ photo: await keepPainting(key, caption) });
  } catch (err) {
    if (err instanceof NoPictureNow) return c.json({ error: 'That painting is no longer here.' }, 404);
    throw err;
  }
});

house.post('/house/art/discard', allow('grandma', 'studio'), async (c) => {
  const { key } = z.object({ key: z.string().max(120) }).parse(await c.req.json());
  await discardPainting(key);
  return c.json({ ok: true });
});

house.post('/house/art/save', allow('grandma', 'studio'), async (c) => {
  const mime = c.req.header('content-type') ?? '';
  if (!/^image\/(png|jpeg)$/.test(mime)) return c.json({ error: 'Unsupported image.' }, 415);
  if (tooBig(c, MAX_IMAGE_BYTES)) return c.json({ error: 'That picture is too large.' }, 413);
  const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const photo = await saveHerArt({
    bytes: await c.req.arrayBuffer(),
    mime,
    width: num(c.req.query('width')),
    height: num(c.req.query('height')),
    caption: (c.req.query('caption') ?? '').slice(0, 120),
    painter: 'Grandma',
  });
  return c.json({ photo });
});

// ---------- her Kitchen ----------
house.get('/house/kitchen', allow('grandma', 'studio', 'family'), async (c) =>
  c.json({ recipes: await listRecipes({ includeDrafts: false }) }),
);

// She told a recipe out loud and said "yes, keep it". Family reviews the draft.
house.post('/house/kitchen/tell', allow('grandma', 'studio'), async (c) => {
  const mime = audioMime(c);
  if (!mime) return c.json({ error: 'Unsupported audio format.' }, 415);
  if (tooBig(c, MAX_AUDIO_BYTES)) return c.json({ error: 'That recording is too long.' }, 413);
  await recipeFromHerVoice(await c.req.arrayBuffer(), mime);
  return c.json({ ok: true });
});

// "Take a picture of it!" — goes into the family album.
house.post('/house/kitchen/:id/cooked', allow('grandma', 'studio'), async (c) => {
  const mime = c.req.header('content-type') ?? '';
  if (!/^image\/(png|jpeg)$/.test(mime)) return c.json({ error: 'Unsupported image.' }, 415);
  if (tooBig(c, MAX_IMAGE_BYTES)) return c.json({ error: 'That picture is too large.' }, 413);
  const recipe = await getRecipe(c.req.param('id'));
  if (!recipe || recipe.status !== 'published') return c.json({ error: 'Recipe not found.' }, 404);
  const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const photo = await saveCookedPhoto(recipe.id, await c.req.arrayBuffer(), mime, num(c.req.query('width')), num(c.req.query('height')));
  return c.json({ photo });
});

house.get('/house/today', allow('grandma', 'studio', 'family'), async (c) => {
  const date = dateSchema.parse(c.req.query('date'));
  return c.json(await getToday(date));
});

// ---------- the Family Studio ----------
const studio = new Hono<HonoEnv>();
studio.use('*', allow('studio'));

function tooBig(c: { req: { header: (n: string) => string | undefined } }, max: number) {
  return Number(c.req.header('content-length') ?? 0) > max;
}

// Photos
studio.get('/photos', async (c) => c.json({ photos: await listPhotos({ includeDrafts: true }) }));

const kindSchema = z.enum(['photo', 'family_art', 'ai_art']);
const collectionSchema = z.enum(['album', 'coloring', 'her_art']);
studio.post('/photos', async (c) => {
  const mime = c.req.header('content-type') ?? '';
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return c.json({ error: 'Please upload a JPEG, PNG or WebP image.' }, 415);
  if (tooBig(c, MAX_IMAGE_BYTES)) return c.json({ error: 'That image is too large (15 MB max).' }, 413);
  const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const photo = await createPhoto({
    bytes: await c.req.arrayBuffer(),
    mime,
    width: num(c.req.query('width')),
    height: num(c.req.query('height')),
    kind: kindSchema.catch('photo').parse(c.req.query('kind')),
    made_by: c.req.query('made_by') || null,
    caption: (c.req.query('caption') ?? '').slice(0, 500),
    collection: collectionSchema.catch('album').parse(c.req.query('collection')),
  });
  return c.json({ photo });
});

const photoPatch = z.object({
  caption: z.string().max(500).optional(),
  when_text: z.string().max(120).nullable().optional(),
  kind: kindSchema.optional(),
  made_by: z.string().max(120).nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
  collection: collectionSchema.optional(),
});
studio.patch('/photos/:id', async (c) => {
  try {
    const photo = await updatePhoto(c.req.param('id'), photoPatch.parse(await c.req.json()));
    return photo ? c.json({ photo }) : c.json({ error: 'Photo not found.' }, 404);
  } catch (err) {
    if (err instanceof AlbumRuleError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

studio.delete('/photos/:id', async (c) => {
  await deletePhoto(c.req.param('id'));
  return c.json({ ok: true });
});

function audioMime(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const mime = (c.req.header('content-type') ?? '').split(';')[0].trim();
  return /^audio\/(mp4|x-m4a|aac|webm|ogg|mpeg)$/.test(mime) ? mime : null;
}

function recordedBy(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const by = decodeURIComponent(c.req.header('x-recorded-by') ?? '').trim();
  return by ? by.slice(0, 80) : null;
}

studio.put('/photos/:id/voice', async (c) => {
  const mime = audioMime(c);
  if (!mime) return c.json({ error: 'Unsupported audio format.' }, 415);
  if (tooBig(c, MAX_AUDIO_BYTES)) return c.json({ error: 'That recording is too long.' }, 413);
  const by = recordedBy(c);
  // She always hears who is speaking; an unnamed voice could confuse her.
  if (!by) return c.json({ error: 'Say who recorded this message.' }, 400);
  const photo = await setPhotoVoice(c.req.param('id'), await c.req.arrayBuffer(), mime, by);
  return photo ? c.json({ photo }) : c.json({ error: 'Photo not found.' }, 404);
});

studio.delete('/photos/:id/voice', async (c) => {
  const photo = await clearPhotoVoice(c.req.param('id'));
  return photo ? c.json({ photo }) : c.json({ error: 'Photo not found.' }, 404);
});

const faceSchema = z.object({
  person_id: z.string().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  r: z.number().min(0.02).max(0.4).optional(),
});
studio.post('/photos/:id/faces', async (c) => {
  const f = faceSchema.parse(await c.req.json());
  const photo = await addFace(c.req.param('id'), f.person_id, f.x, f.y, f.r);
  return photo ? c.json({ photo }) : c.json({ error: 'Photo not found.' }, 404);
});

studio.delete('/faces/:id', async (c) => {
  const photo = await removeFace(c.req.param('id'));
  return photo ? c.json({ photo }) : c.json({ error: 'Face not found.' }, 404);
});

// People
studio.get('/people', async (c) => c.json({ people: await listPeople() }));

const personSchema = z.object({ name: z.string().min(1).max(80), relation: z.string().max(80).nullable().optional() });
studio.post('/people', async (c) => {
  const p = personSchema.parse(await c.req.json());
  return c.json({ person: await createPerson(p.name, p.relation ?? null) });
});

studio.patch('/people/:id', async (c) => {
  const person = await updatePerson(c.req.param('id'), personSchema.partial().parse(await c.req.json()));
  return person ? c.json({ person }) : c.json({ error: 'Person not found.' }, 404);
});

studio.delete('/people/:id', async (c) => {
  await deletePerson(c.req.param('id'));
  return c.json({ ok: true });
});

studio.put('/people/:id/voice', async (c) => {
  const mime = audioMime(c);
  if (!mime) return c.json({ error: 'Unsupported audio format.' }, 415);
  if (tooBig(c, MAX_AUDIO_BYTES)) return c.json({ error: 'That recording is too long.' }, 413);
  const by = recordedBy(c);
  if (!by) return c.json({ error: 'Say who recorded this message.' }, 400);
  const person = await setPersonVoice(c.req.param('id'), await c.req.arrayBuffer(), mime, by);
  return person ? c.json({ person }) : c.json({ error: 'Person not found.' }, 404);
});

studio.delete('/people/:id/voice', async (c) => {
  const person = await clearPersonVoice(c.req.param('id'));
  return person ? c.json({ person }) : c.json({ error: 'Person not found.' }, 404);
});

// Recipes
studio.get('/recipes', async (c) => c.json({ recipes: await listRecipes({ includeDrafts: true }) }));

studio.post('/recipes/card', async (c) => {
  const mime = c.req.header('content-type') ?? '';
  if (mime !== 'image/jpeg' && mime !== 'image/png') return c.json({ error: 'Please upload a JPEG or PNG photo.' }, 415);
  if (tooBig(c, MAX_IMAGE_BYTES)) return c.json({ error: 'That photo is too large (15 MB max).' }, 413);
  return c.json({ recipe: await recipeFromCard(await c.req.arrayBuffer(), mime) });
});

studio.post('/recipes/classics', async (c) => c.json({ added: await addClassics() }));

const sourceSchema = z.enum(['her_words', 'card', 'family', 'classic', 'safety']);
const recipePatch = z.object({
  title: z.string().min(1).max(120).optional(),
  story: z.string().max(4000).nullable().optional(),
  servings: z.string().max(80).nullable().optional(),
  ingredients: z
    .array(z.object({ text: z.string().min(1).max(200), amount: z.string().max(80).nullable(), source: sourceSchema }))
    .max(60)
    .optional(),
  steps: z
    .array(
      z.object({
        text: z.string().min(1).max(500),
        care: z.enum(['oven_on', 'stove_on', 'knife', 'hot', 'heat_off']).nullable(),
        timer_minutes: z.number().int().min(1).max(600).nullable(),
        source: sourceSchema,
      }),
    )
    .max(60)
    .optional(),
  cook_mode: z.enum(['together', 'own']).optional(),
  helper: z.string().max(60).nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
});
studio.patch('/recipes/:id', async (c) => {
  const recipe = await updateRecipe(c.req.param('id'), recipePatch.parse(await c.req.json()));
  return recipe ? c.json({ recipe }) : c.json({ error: 'Recipe not found.' }, 404);
});

studio.delete('/recipes/:id', async (c) => {
  await deleteRecipe(c.req.param('id'));
  return c.json({ ok: true });
});

studio.post('/recipes/:id/paint', async (c) => {
  const recipe = await paintRecipeImage(c.req.param('id'));
  return recipe ? c.json({ recipe }) : c.json({ error: 'Recipe not found.' }, 404);
});

studio.put('/recipes/:id/image', async (c) => {
  const mime = c.req.header('content-type') ?? '';
  if (!/^image\/(jpeg|png)$/.test(mime)) return c.json({ error: 'Please upload a JPEG or PNG image.' }, 415);
  if (tooBig(c, MAX_IMAGE_BYTES)) return c.json({ error: 'That image is too large (15 MB max).' }, 413);
  const recipe = await uploadRecipeImage(c.req.param('id'), await c.req.arrayBuffer(), mime);
  return recipe ? c.json({ recipe }) : c.json({ error: 'Recipe not found.' }, 404);
});

// Today card
const todaySchema = z.object({ date: dateSchema, visitors: z.string().max(200), note: z.string().max(300) });
studio.put('/today', async (c) => {
  const t = todaySchema.parse(await c.req.json());
  return c.json(await setToday(t.date, t.visitors, t.note));
});

// Her iPad
const pairLabel = z.object({ label: z.string().min(1).max(60).optional() });
studio.post('/pairing', async (c) => {
  const { label } = pairLabel.parse(await c.req.json().catch(() => ({})));
  return c.json(await createPairingCode(label ?? 'Grandma’s iPad'));
});

studio.get('/devices', async (c) => c.json({ devices: await listDevices() }));

studio.delete('/devices/:id', async (c) => {
  await revokeDevice(c.req.param('id'));
  return c.json({ ok: true });
});

house.route('/studio', studio);

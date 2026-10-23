// Grandma's photo album: family photos, family drawings, and clearly labeled
// AI art, with the people in them and the family's own recorded voices.

import { env } from '../config.js';
import { all, first, run, nowIso, cryptoId, audit } from '../db.js';

export type PhotoKind = 'photo' | 'family_art' | 'ai_art';

/** album = her photo album · coloring = the coloring library · her_art = what she painted. */
export type Collection = 'album' | 'coloring' | 'her_art';

export interface Face {
  id: string;
  person_id: string;
  name: string;
  relation: string | null;
  x: number;
  y: number;
  r: number;
  voice_url: string | null;
  voice_by: string | null;
}

export interface AlbumPhoto {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  kind: PhotoKind;
  caption: string;
  when_text: string | null;
  made_by: string | null;
  is_ai_generated: boolean;
  /** Always shown to her for anything that isn't a plain family photo. */
  label: string | null;
  voice: { url: string; by: string | null } | null;
  faces: Face[];
  status: 'draft' | 'published';
  collection: Collection;
  created_at: string;
  published_at: string | null;
  is_new: boolean;
}

export interface Person {
  id: string;
  name: string;
  relation: string | null;
  voice_url: string | null;
  voice_by: string | null;
  photo_count: number;
}

const media = (key: string | null) => (key ? `/media/${key}` : null);
const NEW_FOR_MS = 3 * 24 * 60 * 60_000;

export function provenanceLabel(kind: PhotoKind, madeBy: string | null): string | null {
  const who = madeBy?.trim() || 'the family';
  if (kind === 'ai_art') return `Art made with AI by ${who}`;
  if (kind === 'family_art') return `Made by ${who}`;
  return null;
}

async function facesFor(photoIds: string[]): Promise<Map<string, Face[]>> {
  const out = new Map<string, Face[]>();
  if (!photoIds.length) return out;
  const rows = await all(
    `SELECT f.id, f.photo_id, f.person_id, f.x, f.y, f.r,
            p.name, p.relation, p.intro_audio_key, p.intro_recorded_by
     FROM photo_faces f JOIN people p ON p.id = f.person_id
     WHERE f.photo_id IN (${photoIds.map(() => '?').join(',')})
     ORDER BY f.x`,
    ...photoIds,
  );
  for (const r of rows) {
    const list = out.get(r.photo_id) ?? [];
    list.push({
      id: r.id,
      person_id: r.person_id,
      name: r.name,
      relation: r.relation,
      x: r.x,
      y: r.y,
      r: r.r,
      voice_url: media(r.intro_audio_key),
      voice_by: r.intro_recorded_by,
    });
    out.set(r.photo_id, list);
  }
  return out;
}

function rowToPhoto(r: any, faces: Face[]): AlbumPhoto {
  return {
    id: r.id,
    url: `/media/${r.image_key}`,
    width: r.width,
    height: r.height,
    kind: r.kind,
    caption: r.caption,
    when_text: r.when_text,
    made_by: r.made_by,
    is_ai_generated: !!r.is_ai_generated,
    label: provenanceLabel(r.kind, r.made_by),
    voice: r.voice_key ? { url: `/media/${r.voice_key}`, by: r.voice_by } : null,
    faces,
    status: r.status,
    collection: r.collection ?? 'album',
    created_at: r.created_at,
    published_at: r.published_at,
    is_new: !!r.published_at && Date.now() - Date.parse(r.published_at) < NEW_FOR_MS,
  };
}

/** Published only (unless drafts are asked for), newest first so new things from family greet her. */
export async function listPhotos(opts: { includeDrafts: boolean; collection?: Collection }): Promise<AlbumPhoto[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeDrafts) where.push(`status = 'published'`);
  if (opts.collection) {
    where.push('collection = ?');
    params.push(opts.collection);
  }
  const rows = await all(
    `SELECT * FROM photos ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY (status = 'draft') DESC, COALESCE(published_at, created_at) DESC`,
    ...params,
  );
  const faces = await facesFor(rows.map((r) => r.id));
  return rows.map((r) => rowToPhoto(r, faces.get(r.id) ?? []));
}

export async function getPhoto(id: string): Promise<AlbumPhoto | null> {
  const r = await first(`SELECT * FROM photos WHERE id = ?`, id);
  if (!r) return null;
  return rowToPhoto(r, (await facesFor([id])).get(id) ?? []);
}

function extFor(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  return 'jpg';
}

export async function createPhoto(input: {
  bytes: ArrayBuffer | Uint8Array | ReadableStream;
  mime: string;
  width: number | null;
  height: number | null;
  kind: PhotoKind;
  caption?: string;
  when_text?: string | null;
  made_by?: string | null;
  status?: 'draft' | 'published';
  collection?: Collection;
  created_by?: string;
}): Promise<AlbumPhoto> {
  const id = cryptoId('pho');
  const key = `photos/${id}.${extFor(input.mime)}`;
  await env.MEDIA.put(key, input.bytes, { httpMetadata: { contentType: input.mime } });
  const now = nowIso();
  const status = input.status ?? 'draft';
  await run(
    `INSERT INTO photos (id, image_key, image_mime, width, height, kind, caption, when_text, made_by,
       is_ai_generated, status, collection, created_by, created_at, updated_at, published_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    key,
    input.mime,
    input.width,
    input.height,
    input.kind,
    input.caption ?? '',
    input.when_text ?? null,
    input.made_by ?? null,
    input.kind === 'ai_art' ? 1 : 0,
    status,
    input.collection ?? 'album',
    input.created_by ?? 'studio',
    now,
    now,
    status === 'published' ? now : null,
  );
  await audit('photo.create', 'photo', id, input.kind);
  return (await getPhoto(id))!;
}

export class AlbumRuleError extends Error {}

export async function updatePhoto(
  id: string,
  patch: {
    caption?: string;
    when_text?: string | null;
    kind?: PhotoKind;
    made_by?: string | null;
    status?: 'draft' | 'published';
    collection?: Collection;
  },
): Promise<AlbumPhoto | null> {
  const cur = await first(`SELECT * FROM photos WHERE id = ?`, id);
  if (!cur) return null;
  const kind: PhotoKind = patch.kind ?? cur.kind;
  const madeBy = patch.made_by !== undefined ? patch.made_by : cur.made_by;
  const status = patch.status ?? cur.status;

  // Honesty rail: art never reaches her without saying who made it (and, for
  // AI art, that AI was used). The label is derived, so it can't be skipped.
  if (status === 'published' && kind !== 'photo' && !madeBy?.trim()) {
    throw new AlbumRuleError('Say who made this art before publishing it.');
  }

  const now = nowIso();
  const publishedAt = status === 'published' ? (cur.published_at ?? now) : null;
  await run(
    `UPDATE photos SET caption = ?, when_text = ?, kind = ?, made_by = ?, is_ai_generated = ?,
       status = ?, collection = ?, published_at = ?, updated_at = ? WHERE id = ?`,
    patch.caption ?? cur.caption,
    patch.when_text !== undefined ? patch.when_text : cur.when_text,
    kind,
    madeBy,
    kind === 'ai_art' ? 1 : 0,
    status,
    patch.collection ?? cur.collection ?? 'album',
    publishedAt,
    now,
    id,
  );
  if (patch.status && patch.status !== cur.status) await audit(`photo.${patch.status}`, 'photo', id);
  return getPhoto(id);
}

export async function deletePhoto(id: string): Promise<void> {
  const cur = await first(`SELECT image_key, voice_key FROM photos WHERE id = ?`, id);
  if (!cur) return;
  await run(`DELETE FROM photos WHERE id = ?`, id);
  await env.MEDIA.delete([cur.image_key, cur.voice_key].filter(Boolean));
  await audit('photo.delete', 'photo', id);
}

/** A family member's own recorded caption for a photo ("Hi Grandma, it's me…"). */
export async function setPhotoVoice(
  id: string,
  audio: ArrayBuffer | ReadableStream,
  mime: string,
  recordedBy: string,
): Promise<AlbumPhoto | null> {
  const cur = await first(`SELECT voice_key FROM photos WHERE id = ?`, id);
  if (!cur) return null;
  const key = `voices/${cryptoId('vox')}.${extFor(mime)}`;
  await env.MEDIA.put(key, audio, { httpMetadata: { contentType: mime } });
  await run(
    `UPDATE photos SET voice_key = ?, voice_mime = ?, voice_by = ?, updated_at = ? WHERE id = ?`,
    key,
    mime,
    recordedBy,
    nowIso(),
    id,
  );
  if (cur.voice_key) await env.MEDIA.delete(cur.voice_key);
  return getPhoto(id);
}

export async function clearPhotoVoice(id: string): Promise<AlbumPhoto | null> {
  const cur = await first(`SELECT voice_key FROM photos WHERE id = ?`, id);
  if (!cur) return null;
  await run(`UPDATE photos SET voice_key = NULL, voice_mime = NULL, voice_by = NULL, updated_at = ? WHERE id = ?`, nowIso(), id);
  if (cur.voice_key) await env.MEDIA.delete(cur.voice_key);
  return getPhoto(id);
}

// ---------- faces ----------
export async function addFace(photoId: string, personId: string, x: number, y: number, r = 0.08) {
  const id = cryptoId('face');
  await run(
    `INSERT INTO photo_faces (id, photo_id, person_id, x, y, r, created_at) VALUES (?,?,?,?,?,?,?)`,
    id,
    photoId,
    personId,
    x,
    y,
    r,
    nowIso(),
  );
  return getPhoto(photoId);
}

export async function removeFace(faceId: string) {
  const f = await first(`SELECT photo_id FROM photo_faces WHERE id = ?`, faceId);
  if (!f) return null;
  await run(`DELETE FROM photo_faces WHERE id = ?`, faceId);
  return getPhoto(f.photo_id);
}

// ---------- people ----------
export async function listPeople(): Promise<Person[]> {
  const rows = await all(
    `SELECT p.*, (SELECT COUNT(*) FROM photo_faces f WHERE f.person_id = p.id) AS photo_count
     FROM people p ORDER BY p.name COLLATE NOCASE`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    relation: r.relation,
    voice_url: media(r.intro_audio_key),
    voice_by: r.intro_recorded_by,
    photo_count: r.photo_count,
  }));
}

export async function createPerson(name: string, relation: string | null): Promise<Person> {
  const id = cryptoId('per');
  const now = nowIso();
  await run(
    `INSERT INTO people (id, name, relation, created_at, updated_at) VALUES (?,?,?,?,?)`,
    id,
    name.trim(),
    relation?.trim() || null,
    now,
    now,
  );
  return (await listPeople()).find((p) => p.id === id)!;
}

export async function updatePerson(id: string, patch: { name?: string; relation?: string | null }) {
  const cur = await first(`SELECT * FROM people WHERE id = ?`, id);
  if (!cur) return null;
  await run(
    `UPDATE people SET name = ?, relation = ?, updated_at = ? WHERE id = ?`,
    patch.name?.trim() || cur.name,
    patch.relation !== undefined ? patch.relation?.trim() || null : cur.relation,
    nowIso(),
    id,
  );
  return (await listPeople()).find((p) => p.id === id) ?? null;
}

export async function deletePerson(id: string) {
  const cur = await first(`SELECT intro_audio_key FROM people WHERE id = ?`, id);
  if (!cur) return;
  await run(`DELETE FROM people WHERE id = ?`, id);
  if (cur.intro_audio_key) await env.MEDIA.delete(cur.intro_audio_key);
}

/** "Hi Grandma, it's Danny." Recorded by the real person, never synthesized. */
export async function setPersonVoice(id: string, audio: ArrayBuffer | ReadableStream, mime: string, recordedBy: string) {
  const cur = await first(`SELECT intro_audio_key FROM people WHERE id = ?`, id);
  if (!cur) return null;
  const key = `voices/${cryptoId('vox')}.${extFor(mime)}`;
  await env.MEDIA.put(key, audio, { httpMetadata: { contentType: mime } });
  await run(
    `UPDATE people SET intro_audio_key = ?, intro_audio_mime = ?, intro_recorded_by = ?, updated_at = ? WHERE id = ?`,
    key,
    mime,
    recordedBy,
    nowIso(),
    id,
  );
  if (cur.intro_audio_key) await env.MEDIA.delete(cur.intro_audio_key);
  return (await listPeople()).find((p) => p.id === id) ?? null;
}

export async function clearPersonVoice(id: string) {
  const cur = await first(`SELECT intro_audio_key FROM people WHERE id = ?`, id);
  if (!cur) return null;
  await run(
    `UPDATE people SET intro_audio_key = NULL, intro_audio_mime = NULL, intro_recorded_by = NULL, updated_at = ? WHERE id = ?`,
    nowIso(),
    id,
  );
  if (cur.intro_audio_key) await env.MEDIA.delete(cur.intro_audio_key);
  return (await listPeople()).find((p) => p.id === id) ?? null;
}

// ---------- the Today card ----------
export async function getToday(date: string) {
  const r = await first(`SELECT visitors, note FROM today_notes WHERE date = ?`, date);
  return { date, visitors: r?.visitors ?? '', note: r?.note ?? '' };
}

export async function setToday(date: string, visitors: string, note: string) {
  await run(
    `INSERT INTO today_notes (date, visitors, note, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(date) DO UPDATE SET visitors = excluded.visitors, note = excluded.note, updated_at = excluded.updated_at`,
    date,
    visitors.trim(),
    note.trim(),
    nowIso(),
  );
  return getToday(date);
}

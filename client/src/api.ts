import type {
  AlbumPhoto,
  ArtStudioData,
  Collection,
  Device,
  Health,
  Memory,
  Person,
  PhotoKind,
  Painting,
  Recipe,
  RespondResult,
  Role,
  Session,
  TodayNote,
  VaultStats,
} from './types';

const BASE = '/api';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => fetch(`${BASE}/health`).then(j<Health>),

  startConversation: () =>
    fetch(`${BASE}/conversations`, { method: 'POST' }).then(j<{ id: string }>),

  sendMessage: (conversationId: string, text: string) =>
    fetch(`${BASE}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(j<RespondResult>),

  sendMessageStream: async (
    conversationId: string,
    text: string,
    handlers: {
      onMeta?: (m: { usedMemories: { id: string; title: string; score: number }[]; openModelOnline: boolean }) => void;
      onToken: (chunk: string) => void;
      onDone?: () => void;
      onError?: () => void;
    },
  ) => {
    const res = await fetch(`${BASE}/conversations/${conversationId}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok || !res.body) throw new Error('stream failed');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        try {
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === 'meta') handlers.onMeta?.(ev);
          else if (ev.type === 'token') handlers.onToken(ev.text);
          else if (ev.type === 'done') handlers.onDone?.();
          else if (ev.type === 'error') handlers.onError?.();
        } catch {
          /* ignore */
        }
      }
    }
  },

  consolidate: (conversationId: string, text: string, force = false) =>
    fetch(`${BASE}/conversations/${conversationId}/consolidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, force }),
    }).then(j<{ saved: boolean; memory?: Memory; reason?: string }>),

  endConversation: (conversationId: string) =>
    fetch(`${BASE}/conversations/${conversationId}/end`, { method: 'POST' }).then(j),

  listMemories: () => fetch(`${BASE}/memories`).then(j<{ memories: Memory[] }>),

  getMemory: (id: string) => fetch(`${BASE}/memories/${id}`).then(j<{ memory: Memory }>),

  makeArt: (id: string, scene?: string) =>
    fetch(`${BASE}/memories/${id}/art`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene }),
    }).then(j<{ artifact: any }>),

  setVisibility: (id: string, visibility: string) =>
    fetch(`${BASE}/memories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    }).then(j),

  deleteMemory: (id: string) =>
    fetch(`${BASE}/memories/${id}`, { method: 'DELETE' }).then(j),

  timeline: () =>
    fetch(`${BASE}/timeline`).then(
      j<{ decades: { decade: string; memories: { id: string; title: string; when: string | null }[] }[] }>,
    ),

  search: (q: string) =>
    fetch(`${BASE}/search?q=${encodeURIComponent(q)}`).then(
      j<{ results: { id: string; title: string; summary: string; score: number }[] }>,
    ),

  vault: () => fetch(`${BASE}/vault`).then(j<{ stats: VaultStats; demoMode: boolean }>),

  exportUrl: `${BASE}/export`,
  exportMarkdownUrl: `${BASE}/export/markdown`,
  exportPdfUrl: `${BASE}/export/pdf`,

  // ---------- the front door ----------
  session: () => fetch(`${BASE}/session`).then(j<Session>),

  unlock: (passcode: string) => post<{ role: Role }>('/session/unlock', { passcode }),

  pair: (code: string) => post<{ role: Role }>('/session/pair', { code }),

  logout: () => post<{ ok: boolean }>('/session/logout', {}),

  // ---------- her iPad ----------
  album: () => fetch(`${BASE}/house/album`).then(j<{ photos: AlbumPhoto[] }>),

  today: (date: string) => fetch(`${BASE}/house/today?date=${date}`).then(j<TodayNote>),

  art: () => fetch(`${BASE}/house/art`).then(j<ArtStudioData>),

  kitchen: () => fetch(`${BASE}/house/kitchen`).then(j<{ recipes: Recipe[] }>),

  /** She told a recipe out loud and said yes, keep it. */
  tellRecipe: (audio: Blob) =>
    fetch(`${BASE}/house/kitchen/tell`, {
      method: 'POST',
      headers: { 'Content-Type': audio.type.split(';')[0] || 'audio/mp4' },
      body: audio,
    }).then(j<{ ok: boolean }>),

  cookedPhoto: (recipeId: string, image: Blob, size: { width: number; height: number }) =>
    fetch(`${BASE}/house/kitchen/${recipeId}/cooked?width=${size.width}&height=${size.height}`, {
      method: 'POST',
      headers: { 'Content-Type': image.type },
      body: image,
    }).then(j<{ photo: AlbumPhoto }>),

  /** Draw a new coloring page on the spot. photo is null when none could be drawn. */
  newPage: (idea: string) => post<{ photo: AlbumPhoto | null }>('/house/art/new', { idea }),

  /** Her spoken words → text she can check (empty if nothing was heard). */
  artListen: (audio: Blob) =>
    fetch(`${BASE}/house/art/listen`, {
      method: 'POST',
      headers: { 'Content-Type': audio.type.split(';')[0] || 'audio/mp4' },
      body: audio,
    }).then(j<{ text: string }>),

  /** Paint what she said, or an idea she tapped. painting is null if it couldn't be made now. */
  paintWords: (input: { text?: string; idea?: string }) =>
    post<{ painting: Painting | null }>('/house/art/paint', input),

  paintDrawing: (drawing: Blob, said: string) =>
    fetch(`${BASE}/house/art/paint-drawing?said=${encodeURIComponent(said)}`, {
      method: 'POST',
      headers: { 'Content-Type': drawing.type },
      body: drawing,
    }).then(j<{ painting: Painting | null }>),

  keepPainting: (key: string, caption: string) => post<{ photo: AlbumPhoto }>('/house/art/keep', { key, caption }),

  discardPainting: (key: string) => post<{ ok: boolean }>('/house/art/discard', { key }),

  saveHerArt: (image: Blob, opts: { width: number; height: number; caption: string }) => {
    const q = new URLSearchParams({ width: String(opts.width), height: String(opts.height), caption: opts.caption });
    return fetch(`${BASE}/house/art/save?${q}`, {
      method: 'POST',
      headers: { 'Content-Type': image.type },
      body: image,
    }).then(j<{ photo: AlbumPhoto }>);
  },

  // ---------- the Family Studio ----------
  studio: {
    photos: () => fetch(`${BASE}/studio/photos`).then(j<{ photos: AlbumPhoto[] }>),

    upload: (
      blob: Blob,
      opts: {
        width: number;
        height: number;
        kind: PhotoKind;
        made_by?: string | null;
        collection?: Collection;
      },
    ) => {
      const q = new URLSearchParams({
        width: String(opts.width),
        height: String(opts.height),
        kind: opts.kind,
        collection: opts.collection ?? 'album',
        ...(opts.made_by ? { made_by: opts.made_by } : {}),
      });
      return fetch(`${BASE}/studio/photos?${q}`, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      }).then(j<{ photo: AlbumPhoto }>);
    },

    updatePhoto: (
      id: string,
      patch: Partial<Pick<AlbumPhoto, 'caption' | 'when_text' | 'kind' | 'made_by' | 'status' | 'collection'>>,
    ) => send<{ photo: AlbumPhoto }>('PATCH', `/studio/photos/${id}`, patch),

    deletePhoto: (id: string) => send<{ ok: boolean }>('DELETE', `/studio/photos/${id}`),

    setPhotoVoice: (id: string, audio: Blob, recordedBy: string) =>
      putAudio<{ photo: AlbumPhoto }>(`/studio/photos/${id}/voice`, audio, recordedBy),

    clearPhotoVoice: (id: string) => send<{ photo: AlbumPhoto }>('DELETE', `/studio/photos/${id}/voice`),

    addFace: (photoId: string, face: { person_id: string; x: number; y: number; r?: number }) =>
      post<{ photo: AlbumPhoto }>(`/studio/photos/${photoId}/faces`, face),

    removeFace: (faceId: string) => send<{ photo: AlbumPhoto }>('DELETE', `/studio/faces/${faceId}`),

    people: () => fetch(`${BASE}/studio/people`).then(j<{ people: Person[] }>),

    addPerson: (name: string, relation: string | null) =>
      post<{ person: Person }>('/studio/people', { name, relation }),

    updatePerson: (id: string, patch: { name?: string; relation?: string | null }) =>
      send<{ person: Person }>('PATCH', `/studio/people/${id}`, patch),

    deletePerson: (id: string) => send<{ ok: boolean }>('DELETE', `/studio/people/${id}`),

    setPersonVoice: (id: string, audio: Blob, recordedBy: string) =>
      putAudio<{ person: Person }>(`/studio/people/${id}/voice`, audio, recordedBy),

    clearPersonVoice: (id: string) => send<{ person: Person }>('DELETE', `/studio/people/${id}/voice`),

    setToday: (t: TodayNote) => send<TodayNote>('PUT', '/studio/today', t),

    pairingCode: (label?: string) =>
      post<{ code: string; expires_at: string }>('/studio/pairing', label ? { label } : {}),

    devices: () => fetch(`${BASE}/studio/devices`).then(j<{ devices: Device[] }>),

    forgetDevice: (id: string) => send<{ ok: boolean }>('DELETE', `/studio/devices/${id}`),

    recipes: () => fetch(`${BASE}/studio/recipes`).then(j<{ recipes: Recipe[] }>),

    recipeFromCard: (image: Blob) =>
      fetch(`${BASE}/studio/recipes/card`, {
        method: 'POST',
        headers: { 'Content-Type': image.type },
        body: image,
      }).then(j<{ recipe: Recipe }>),

    addClassics: () => post<{ added: number }>('/studio/recipes/classics', {}),

    updateRecipe: (
      id: string,
      patch: Partial<
        Pick<Recipe, 'title' | 'story' | 'servings' | 'ingredients' | 'steps' | 'cook_mode' | 'helper' | 'status'>
      >,
    ) => send<{ recipe: Recipe }>('PATCH', `/studio/recipes/${id}`, patch),

    deleteRecipe: (id: string) => send<{ ok: boolean }>('DELETE', `/studio/recipes/${id}`),

    paintRecipe: (id: string) => post<{ recipe: Recipe }>(`/studio/recipes/${id}/paint`, {}),

    recipeImage: (id: string, image: Blob) =>
      fetch(`${BASE}/studio/recipes/${id}/image`, {
        method: 'PUT',
        headers: { 'Content-Type': image.type },
        body: image,
      }).then(j<{ recipe: Recipe }>),
  },
};

function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(j<T>);
}

function post<T>(path: string, body: unknown): Promise<T> {
  return send<T>('POST', path, body);
}

function putAudio<T>(path: string, audio: Blob, recordedBy: string): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': audio.type.split(';')[0] || 'audio/mp4',
      'X-Recorded-By': encodeURIComponent(recordedBy),
    },
    body: audio,
  }).then(j<T>);
}

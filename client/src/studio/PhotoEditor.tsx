// One photo in the Studio: tap faces to name them, write the caption she'll
// read, record a voice message, and publish (or take it back down).

import { useState, type MouseEvent } from 'react';
import { api } from '../api';
import type { AlbumPhoto, Person, PhotoKind } from '../types';
import { VoiceRecorder } from './VoiceRecorder';
import { KIND_LABELS } from './PhotosPanel';

export function PhotoEditor({
  photo,
  people,
  onClose,
  reload,
}: {
  photo: AlbumPhoto;
  people: Person[];
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const [caption, setCaption] = useState(photo.caption);
  const [when, setWhen] = useState(photo.when_text ?? '');
  const [kind, setKind] = useState<PhotoKind>(photo.kind);
  const [madeBy, setMadeBy] = useState(photo.made_by ?? '');
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [newName, setNewName] = useState('');
  const [newRelation, setNewRelation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    caption !== photo.caption ||
    when !== (photo.when_text ?? '') ||
    kind !== photo.kind ||
    madeBy !== (photo.made_by ?? '');

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const saveDetails = () =>
    act(() =>
      api.studio.updatePhoto(photo.id, {
        caption: caption.trim(),
        when_text: when.trim() || null,
        kind,
        made_by: madeBy.trim() || null,
      }),
    );

  const setStatus = (status: 'draft' | 'published') =>
    // One update carries any unsaved edits along with the new status.
    act(() =>
      api.studio.updatePhoto(photo.id, {
        status,
        caption: caption.trim(),
        when_text: when.trim() || null,
        kind,
        made_by: madeBy.trim() || null,
      }),
    );

  function placeFace(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPending({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  }

  const tag = (personId: string) =>
    act(async () => {
      if (!pending) return;
      await api.studio.addFace(photo.id, { person_id: personId, ...pending });
      setPending(null);
    });

  const tagNew = () =>
    act(async () => {
      if (!pending || !newName.trim()) return;
      const { person } = await api.studio.addPerson(newName.trim(), newRelation.trim() || null);
      await api.studio.addFace(photo.id, { person_id: person.id, ...pending });
      setPending(null);
      setNewName('');
      setNewRelation('');
    });

  const aspect = photo.width && photo.height ? `${photo.width} / ${photo.height}` : '4 / 3';

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm">
      <div className="card my-4 w-full max-w-5xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-serif text-2xl text-cocoa">
            {photo.status === 'published' ? 'On her iPad' : 'Draft'} · {caption || 'Untitled'}
          </h2>
          <button className="btn-ghost px-4 py-2" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          {/* The picture, with face tags */}
          <div>
            <p className="mb-2 font-sans text-sm text-umber">
              Tap someone’s face to tell her who it is.
            </p>
            <div
              className="relative w-full cursor-crosshair overflow-hidden rounded-2xl bg-parchment"
              style={{ aspectRatio: aspect }}
              onClick={placeFace}
            >
              <img src={photo.url} alt={caption} className="h-full w-full object-contain" draggable={false} />
              {photo.faces.map((f) => (
                <span
                  key={f.id}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-gold shadow-lamp"
                  style={{
                    left: `${f.x * 100}%`,
                    top: `${f.y * 100}%`,
                    width: `${f.r * 200}%`,
                    aspectRatio: '1',
                  }}
                >
                  <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink/80 px-2 py-0.5 font-sans text-xs font-semibold text-linen">
                    {f.name}
                  </span>
                </span>
              ))}
              {pending && (
                <span
                  className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-4 border-dashed border-ember"
                  style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}
                />
              )}
            </div>

            {pending && (
              <div className="mt-3 rounded-2xl border border-ember/30 bg-ember/5 p-4 font-sans">
                <p className="mb-2 font-semibold text-ink">Who is this?</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {people.map((p) => (
                    <button
                      key={p.id}
                      disabled={busy}
                      onClick={() => tag(p.id)}
                      className="rounded-full border border-cocoa/20 bg-linen px-3 py-1.5 text-sm font-semibold text-cocoa hover:border-cocoa"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New name, as she says it"
                    className="min-w-0 flex-1 rounded-xl border border-cocoa/20 bg-linen px-3 py-2"
                  />
                  <input
                    value={newRelation}
                    onChange={(e) => setNewRelation(e.target.value)}
                    placeholder="e.g. your grandson"
                    className="min-w-0 flex-1 rounded-xl border border-cocoa/20 bg-linen px-3 py-2"
                  />
                  <button className="btn-primary px-4 py-2 text-base" disabled={busy || !newName.trim()} onClick={tagNew}>
                    Add
                  </button>
                  <button className="px-2 text-sm text-umber underline" onClick={() => setPending(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {photo.faces.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 font-sans">
                {photo.faces.map((f) => (
                  <span key={f.id} className="chip">
                    {f.name}
                    <button
                      aria-label={`Remove ${f.name}`}
                      className="ml-1 text-ember"
                      onClick={() => act(() => api.studio.removeFace(f.id))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Words, voice, and publishing */}
          <div className="flex flex-col gap-4 font-sans">
            <label className="text-sm text-umber">
              Caption she’ll read (large print)
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. Danny’s graduation day"
                className="mt-1 block w-full rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-lg text-ink"
              />
            </label>
            <label className="text-sm text-umber">
              When <span className="text-umber/70">(as the family would say it — optional)</span>
              <input
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                placeholder="e.g. Summer 1962"
                className="mt-1 block w-full rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink"
              />
            </label>
            <label className="text-sm text-umber">
              What is it?
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as PhotoKind)}
                className="mt-1 block w-full rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink"
              >
                {(Object.keys(KIND_LABELS) as PhotoKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            {kind !== 'photo' && (
              <label className="text-sm text-umber">
                Who made it? <span className="text-umber/70">(required to publish art)</span>
                <input
                  value={madeBy}
                  onChange={(e) => setMadeBy(e.target.value)}
                  placeholder="e.g. Danny"
                  className="mt-1 block w-full rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink"
                />
                <span className="mt-1 block text-xs text-umber/80">
                  She’ll see: “{kind === 'ai_art' ? 'Art made with AI by' : 'Made by'} {madeBy.trim() || '…'}”
                </span>
              </label>
            )}
            {dirty && (
              <button className="btn-ghost py-3" disabled={busy} onClick={saveDetails}>
                Save changes
              </button>
            )}

            <VoiceRecorder
              prompt="Record a message she can play with this photo: “Hi Grandma, it’s me — this is from my graduation…”"
              existingUrl={photo.voice?.url ?? null}
              existingBy={photo.voice?.by ?? null}
              onSave={async (blob, by) => {
                await api.studio.setPhotoVoice(photo.id, blob, by);
                await reload();
              }}
              onClear={async () => {
                await api.studio.clearPhotoVoice(photo.id);
                await reload();
              }}
            />

            {error && <p className="text-ember">{error}</p>}

            <div className="mt-2 flex flex-wrap gap-3 border-t border-cocoa/10 pt-4">
              {photo.status === 'draft' ? (
                <button className="btn-primary" disabled={busy} onClick={() => setStatus('published')}>
                  📲 Publish to her iPad
                </button>
              ) : (
                <button className="btn-ghost" disabled={busy} onClick={() => setStatus('draft')}>
                  Take off her iPad
                </button>
              )}
              <button
                className="ml-auto px-3 text-sm text-ember underline"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Delete this photo for good? It will disappear from her iPad too.')) {
                    act(async () => {
                      await api.studio.deletePhoto(photo.id);
                      onClose();
                    });
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

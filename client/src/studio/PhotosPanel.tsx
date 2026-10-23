// Upload photos and art, then open one to caption it, tag faces, record a
// voice message, and publish it to her iPad. Art can go to her photo album or to
// her Art Studio's coloring library; her own paintings show up here too.

import { useRef, useState } from 'react';
import { api } from '../api';
import type { AlbumPhoto, Collection, Person, PhotoKind } from '../types';
import { prepareImage } from './image';
import { PhotoEditor } from './PhotoEditor';

export const KIND_LABELS: Record<PhotoKind, string> = {
  photo: 'Family photo',
  family_art: 'Drawing or art by family',
  ai_art: 'Art made with AI',
};

export const COLLECTION_LABELS: Record<Exclude<Collection, 'her_art'>, string> = {
  album: 'Her photo album',
  coloring: 'Coloring library (Art Studio)',
};

export function PhotosPanel({
  photos,
  people,
  reload,
}: {
  photos: AlbumPhoto[];
  people: Person[];
  reload: () => Promise<void>;
}) {
  const [kind, setKind] = useState<PhotoKind>('photo');
  const [collection, setCollection] = useState<Exclude<Collection, 'her_art'>>('album');
  const [madeBy, setMadeBy] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    let last: string | null = null;
    try {
      for (const [i, file] of [...files].entries()) {
        setUploading(`Preparing ${i + 1} of ${files.length}…`);
        const img = await prepareImage(file);
        const { photo } = await api.studio.upload(img.blob, {
          width: img.width,
          height: img.height,
          kind,
          made_by: kind === 'photo' ? null : madeBy.trim() || null,
          collection,
        });
        URL.revokeObjectURL(img.previewUrl);
        last = photo.id;
      }
      await reload();
      if (files.length === 1 && last) setOpenId(last);
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed.');
    } finally {
      setUploading(null);
      if (input.current) input.current.value = '';
    }
  }

  const open = photos.find((p) => p.id === openId) ?? null;
  const drafts = photos.filter((p) => p.status === 'draft');
  const published = photos.filter((p) => p.status === 'published' && p.collection === 'album');
  const coloring = photos.filter((p) => p.status === 'published' && p.collection === 'coloring');
  const herArt = photos.filter((p) => p.collection === 'her_art');

  return (
    <div>
      <div className="card mb-6">
        <h2 className="mb-1 font-serif text-2xl text-cocoa">Add to her iPad</h2>
        <p className="mb-4 font-sans text-sm text-umber">
          New uploads start as <strong>drafts</strong>. Nothing reaches her iPad until you press Publish.
          Location data is stripped from photos before they upload.
        </p>
        <p className="mb-2 font-sans text-sm font-semibold text-umber">Where does it go?</p>
        <div className="mb-4 flex flex-wrap gap-2 font-sans">
          {(Object.keys(COLLECTION_LABELS) as Exclude<Collection, 'her_art'>[]).map((c) => (
            <button
              key={c}
              onClick={() => setCollection(c)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                collection === c ? 'border-sage bg-sage text-linen' : 'border-cocoa/20 bg-linen text-umber'
              }`}
            >
              {COLLECTION_LABELS[c]}
            </button>
          ))}
        </div>
        {collection === 'coloring' && (
          <p className="mb-4 font-sans text-sm text-umber">
            Coloring pages work best as bold black outlines on white, with big open shapes and no shading.
          </p>
        )}
        <p className="mb-2 font-sans text-sm font-semibold text-umber">What is it?</p>
        <div className="mb-4 flex flex-wrap gap-2 font-sans">
          {(Object.keys(KIND_LABELS) as PhotoKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                kind === k ? 'border-cocoa bg-cocoa text-linen' : 'border-cocoa/20 bg-linen text-umber'
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {kind !== 'photo' && (
          <label className="mb-4 block font-sans text-sm text-umber">
            Who made it? <span className="text-umber/70">(shown to her{kind === 'ai_art' ? ', with “made with AI”' : ''})</span>
            <input
              value={madeBy}
              onChange={(e) => setMadeBy(e.target.value)}
              placeholder="e.g. Danny"
              className="mt-1 block w-full max-w-sm rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink"
            />
          </label>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
        <button className="btn-primary" disabled={!!uploading} onClick={() => input.current?.click()}>
          {uploading ?? '⬆ Choose photos'}
        </button>
        {error && <p className="mt-3 font-sans text-ember">{error}</p>}
      </div>

      {drafts.length > 0 && (
        <Section title={`Drafts — not on her iPad yet (${drafts.length})`}>
          {drafts.map((p) => (
            <Thumb key={p.id} photo={p} onOpen={() => setOpenId(p.id)} />
          ))}
        </Section>
      )}

      <Section title={`In her photo album (${published.length})`}>
        {published.length === 0 && (
          <p className="col-span-full font-sans text-umber">Nothing published yet.</p>
        )}
        {published.map((p) => (
          <Thumb key={p.id} photo={p} onOpen={() => setOpenId(p.id)} />
        ))}
      </Section>

      <Section title={`Coloring library (${coloring.length})`}>
        {coloring.length === 0 && (
          <p className="col-span-full font-sans text-umber">
            No coloring pages yet. Her Art Studio can still draw new ones from her memories.
          </p>
        )}
        {coloring.map((p) => (
          <Thumb key={p.id} photo={p} onOpen={() => setOpenId(p.id)} />
        ))}
      </Section>

      {herArt.length > 0 && (
        <Section title={`Her paintings (${herArt.length})`}>
          {herArt.map((p) => (
            <Thumb key={p.id} photo={p} onOpen={() => setOpenId(p.id)} />
          ))}
        </Section>
      )}

      {open && (
        <PhotoEditor
          photo={open}
          people={people}
          onClose={() => setOpenId(null)}
          reload={reload}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h3 className="mb-3 font-serif text-xl text-cocoa">{title}</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function Thumb({ photo, onOpen }: { photo: AlbumPhoto; onOpen: () => void }) {
  const missing: string[] = [];
  if (!photo.caption) missing.push('caption');
  if (!photo.voice) missing.push('voice');
  return (
    <button
      onClick={onOpen}
      className="card overflow-hidden p-0 text-left transition hover:-translate-y-0.5 hover:shadow-lamp focus:outline-none focus-visible:ring-4 focus-visible:ring-gold/60"
    >
      <div className="relative aspect-[4/3] bg-parchment">
        <img src={photo.url} alt={photo.caption} className="h-full w-full object-cover" loading="lazy" />
        {photo.status === 'draft' && (
          <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 font-sans text-xs font-semibold text-linen">
            Draft
          </span>
        )}
        {photo.label && (
          <span className="absolute bottom-2 left-2 rounded-full bg-gold/90 px-2 py-0.5 font-sans text-xs font-semibold text-ink">
            {photo.is_ai_generated ? 'AI art' : 'Art'}
          </span>
        )}
      </div>
      <div className="p-3 font-sans text-sm">
        <p className="truncate font-semibold text-ink">{photo.caption || 'No caption yet'}</p>
        <p className="truncate text-umber">
          {photo.collection === 'album'
            ? photo.faces.length
              ? photo.faces.map((f) => f.name).join(', ')
              : 'No one tagged'
            : photo.collection === 'coloring'
              ? 'Coloring page'
              : photo.label}
          {photo.voice ? ' · 🎙️' : ''}
        </p>
        {photo.status === 'draft' && missing.length > 0 && (
          <p className="text-xs text-umber/70">Could add: {missing.join(', ')}</p>
        )}
      </div>
    </button>
  );
}

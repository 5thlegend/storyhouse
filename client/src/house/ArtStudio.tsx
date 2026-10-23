// Her Art Studio. Pick a page and color it. The pages come from the family
// (made ahead, often on Higgsfield Unlimited) or are drawn on the spot from her
// own memories. What she paints is kept for the family to see. No wrong taps,
// no dead ends, Home always top-left.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { AlbumPhoto, ArtIdea, ArtStudioData } from '../types';
import { ColoringCanvas } from './ColoringCanvas';
import { speak } from './voice';

type Screen =
  | { name: 'pick' }
  | { name: 'ideas' }
  | { name: 'drawing'; idea: ArtIdea }
  | { name: 'paint'; page: AlbumPhoto }
  | { name: 'kept'; art: AlbumPhoto }
  | { name: 'view'; art: AlbumPhoto };

export function ArtStudio({ onHome }: { onHome: () => void }) {
  const [data, setData] = useState<ArtStudioData | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'pick' });

  const load = useCallback(() => {
    api
      .art()
      .then(setData)
      .catch(() => setData((d) => d ?? { library: [], mine: [], ideas: [], canDrawNew: false }));
  }, []);
  useEffect(load, [load]);

  async function drawNew(idea: ArtIdea) {
    setScreen({ name: 'drawing', idea });
    let page: AlbumPhoto | null = null;
    try {
      page = (await api.newPage(idea.id)).photo;
    } catch {
      page = null;
    }
    // If a new page can't be drawn right now, quietly offer one that's ready.
    page ??= data?.library[0] ?? null;
    if (page) {
      load();
      setScreen({ name: 'paint', page });
    } else {
      setScreen({ name: 'pick' });
    }
  }

  async function keep(page: AlbumPhoto, painting: Blob, size: { width: number; height: number }) {
    const { photo } = await api.saveHerArt(painting, { ...size, caption: page.caption });
    load();
    setScreen({ name: 'kept', art: photo });
    speak('Lovely. Your picture is saved, and your family can see it.');
  }

  if (screen.name === 'paint') {
    return (
      <ColoringCanvas
        page={screen.page}
        onBack={() => setScreen({ name: 'pick' })}
        onKeep={(blob, size) => keep(screen.page, blob, size)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-4">
        <button
          onClick={screen.name === 'pick' ? onHome : () => setScreen({ name: 'pick' })}
          className="min-h-[72px] rounded-3xl bg-cocoa px-7 font-sans text-2xl font-semibold text-linen shadow-warm"
        >
          {screen.name === 'pick' ? '🏠 Home' : '‹ Pictures'}
        </button>
        <h1 className="font-serif text-4xl text-cocoa sm:text-5xl">Art Studio</h1>
        <span className="w-[120px]" aria-hidden />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">
        {screen.name === 'drawing' && (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="h-24 w-24 animate-pulse rounded-full bg-gold/60" aria-hidden />
            <p className="font-serif text-4xl text-cocoa">Drawing your picture…</p>
            <p className="font-sans text-2xl text-umber">{screen.idea.title}</p>
          </div>
        )}

        {screen.name === 'kept' && (
          <div className="flex flex-col items-center gap-6 text-center">
            <img src={screen.art.url} alt="Your picture" className="max-h-[55vh] rounded-3xl shadow-warm" />
            <p className="font-serif text-4xl text-cocoa">Lovely! It’s saved.</p>
            <p className="font-sans text-2xl text-umber">Your family can see it.</p>
            <button
              onClick={() => setScreen({ name: 'pick' })}
              className="min-h-[72px] rounded-3xl bg-cocoa px-8 font-sans text-2xl font-semibold text-linen shadow-warm"
            >
              Color another picture
            </button>
          </div>
        )}

        {screen.name === 'view' && (
          <div className="flex flex-col items-center gap-5 text-center">
            <img src={screen.art.url} alt={screen.art.caption} className="max-h-[62vh] rounded-3xl shadow-warm" />
            <p className="font-serif text-3xl text-cocoa">{screen.art.caption || 'Your picture'}</p>
            <p className="font-sans text-xl text-umber">Made by you</p>
          </div>
        )}

        {screen.name === 'ideas' && data && (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.ideas.map((idea) => (
              <button
                key={idea.id}
                onClick={() => drawNew(idea)}
                className="min-h-[120px] rounded-3xl border-2 border-gold bg-linen p-6 text-left font-serif text-3xl text-cocoa shadow-warm"
              >
                {idea.title}
              </button>
            ))}
          </div>
        )}

        {screen.name === 'pick' && data && (
          <>
            <h2 className="mb-4 font-serif text-3xl text-cocoa">Pick a picture to color</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {data.canDrawNew && data.ideas.length > 0 && (
                <button
                  onClick={() => setScreen({ name: 'ideas' })}
                  className="flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl border-4 border-dashed border-gold bg-gold/10 p-4 text-center"
                >
                  <span className="text-6xl" aria-hidden>
                    ✨
                  </span>
                  <span className="font-serif text-3xl text-cocoa">A new picture</span>
                </button>
              )}
              {data.library.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setScreen({ name: 'paint', page: p })}
                  className="overflow-hidden rounded-3xl border border-cocoa/10 bg-white text-left shadow-warm"
                >
                  <img src={p.url} alt={p.caption} className="aspect-square w-full object-contain" loading="lazy" />
                  <span className="block px-4 py-3 font-sans text-xl text-ink">{p.caption}</span>
                  {p.label && <span className="block px-4 pb-3 font-sans text-base text-umber">{p.label}</span>}
                </button>
              ))}
            </div>
            {data.library.length === 0 && !data.canDrawNew && (
              <p className="mt-6 font-serif text-3xl text-umber">Your family is adding pictures here.</p>
            )}

            {data.mine.length > 0 && (
              <>
                <h2 className="mb-4 mt-10 font-serif text-3xl text-cocoa">Your pictures</h2>
                <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
                  {data.mine.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setScreen({ name: 'view', art: p })}
                      className="overflow-hidden rounded-3xl border border-cocoa/10 bg-white shadow-warm"
                    >
                      <img src={p.url} alt={p.caption || 'Your picture'} className="aspect-square w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

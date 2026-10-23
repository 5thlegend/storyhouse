// Her iPad's home. Same layout every time: today at the top, rooms below as big
// tiles. Rooms load in the background as soon as home appears, so every tap
// opens instantly.

import { lazy, Suspense, useEffect, useState } from 'react';
import { TodayCard } from './TodayCard';
import { useHouse, useNow } from './useHouse';

const loadAlbum = () => import('./PhotoAlbum');
const loadArt = () => import('./ArtStudio');
const loadKitchen = () => import('./Kitchen');
const loadTalk = () => import('./Talk');
const PhotoAlbum = lazy(() => loadAlbum().then((m) => ({ default: m.PhotoAlbum })));
const ArtStudio = lazy(() => loadArt().then((m) => ({ default: m.ArtStudio })));
const Kitchen = lazy(() => loadKitchen().then((m) => ({ default: m.Kitchen })));
const Talk = lazy(() => loadTalk().then((m) => ({ default: m.Talk })));

type Room = 'home' | 'talk' | 'album' | 'art' | 'kitchen';

const TILE =
  'relative flex min-h-[230px] overflow-hidden rounded-[2rem] text-left shadow-warm focus:outline-none focus-visible:ring-8 focus-visible:ring-gold/60';

export function GrandmaHome() {
  const [room, setRoom] = useState<Room>('home');
  const { photos, today } = useHouse();
  const now = useNow();

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadTalk();
      void loadAlbum();
      void loadArt();
      void loadKitchen();
    }, 300);
    return () => window.clearTimeout(id);
  }, []);

  const home = () => setRoom('home');
  if (room !== 'home') {
    return (
      <Suspense fallback={<div className="h-full bg-linen" />}>
        {room === 'talk' && <Talk onHome={home} />}
        {room === 'album' && <PhotoAlbum photos={photos ?? []} onHome={home} />}
        {room === 'art' && <ArtStudio onHome={home} />}
        {room === 'kitchen' && <Kitchen onHome={home} />}
      </Suspense>
    );
  }

  const cover = photos?.[0];
  const newCount = photos?.filter((p) => p.is_new).length ?? 0;
  const newFrom = [...new Set(photos?.filter((p) => p.is_new).map((p) => p.voice?.by ?? p.made_by).filter(Boolean))];

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5 sm:p-8">
      <TodayCard now={now} today={today} />

      <div className="grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2">
        <button onClick={() => setRoom('talk')} className={`${TILE} bg-plum`}>
          <span className="absolute right-6 top-4 text-8xl opacity-80" aria-hidden>
            💬
          </span>
          <span className="relative mt-auto p-8">
            <span className="block font-serif text-5xl text-linen drop-shadow sm:text-6xl">Talk with me</span>
            <span className="mt-2 block font-sans text-2xl text-linen/90">Just say hello</span>
          </span>
        </button>

        <button onClick={() => setRoom('album')} className={`${TILE} bg-cocoa`}>
          {cover && (
            <img src={cover.url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" draggable={false} />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
          <span className="relative mt-auto p-8">
            <span className="block font-serif text-5xl text-linen drop-shadow sm:text-6xl">Family Photos</span>
            {newCount > 0 && (
              <span className="mt-3 inline-block rounded-full bg-gold px-5 py-2 font-sans text-2xl font-semibold text-ink">
                {newCount === 1 ? 'A new photo' : `${newCount} new photos`}
                {newFrom.length ? ` from ${newFrom.slice(0, 2).join(' and ')}` : ' from your family'}
              </span>
            )}
          </span>
        </button>

        <button onClick={() => setRoom('art')} className={`${TILE} bg-sage`}>
          <span className="absolute right-6 top-4 text-8xl opacity-80" aria-hidden>
            🎨
          </span>
          <span className="relative mt-auto p-8">
            <span className="block font-serif text-5xl text-linen drop-shadow sm:text-6xl">Art Studio</span>
            <span className="mt-2 block font-sans text-2xl text-linen/90">Color, draw, and paint</span>
          </span>
        </button>

        <button onClick={() => setRoom('kitchen')} className={`${TILE} bg-ember`}>
          <span className="absolute right-6 top-4 text-8xl opacity-80" aria-hidden>
            🥧
          </span>
          <span className="relative mt-auto p-8">
            <span className="block font-serif text-5xl text-linen drop-shadow sm:text-6xl">Kitchen</span>
            <span className="mt-2 block font-sans text-2xl text-linen/90">Your recipes</span>
          </span>
        </button>
      </div>
    </div>
  );
}

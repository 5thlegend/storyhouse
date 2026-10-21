// Her iPad's home. Same layout every time: today at the top, rooms below.
// Phase 1 has one room — Family Photos — so it fills the screen. Later rooms
// (Reading Nook, Music, Art) become more big tiles here.

import { useState } from 'react';
import { TodayCard } from './TodayCard';
import { PhotoAlbum } from './PhotoAlbum';
import { useHouse, useNow } from './useHouse';

export function GrandmaHome() {
  const [room, setRoom] = useState<'home' | 'album'>('home');
  const { photos, today } = useHouse();
  const now = useNow();

  if (room === 'album') return <PhotoAlbum photos={photos ?? []} onHome={() => setRoom('home')} />;

  const cover = photos?.[0];
  const newCount = photos?.filter((p) => p.is_new).length ?? 0;
  const newFrom = [...new Set(photos?.filter((p) => p.is_new).map((p) => p.voice?.by ?? p.made_by).filter(Boolean))];

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5 sm:p-8">
      <TodayCard now={now} today={today} />

      <button
        onClick={() => setRoom('album')}
        className="relative flex min-h-[280px] flex-1 overflow-hidden rounded-[2rem] bg-cocoa text-left shadow-warm focus:outline-none focus-visible:ring-8 focus-visible:ring-gold/60"
      >
        {cover && (
          <img src={cover.url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" draggable={false} />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
        <span className="relative mt-auto p-8">
          <span className="block font-serif text-6xl text-linen drop-shadow sm:text-7xl">Family Photos</span>
          {newCount > 0 && (
            <span className="mt-3 inline-block rounded-full bg-gold px-5 py-2 font-sans text-2xl font-semibold text-ink">
              {newCount === 1 ? 'A new photo' : `${newCount} new photos`}
              {newFrom.length ? ` from ${newFrom.slice(0, 2).join(' and ')}` : ' from your family'}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

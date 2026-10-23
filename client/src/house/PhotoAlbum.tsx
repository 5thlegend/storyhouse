// Her photo album. One photo at a time, huge and calm. No wrong taps, no dead
// ends: the album loops, Home is always in the same corner, and tapping a face
// tells her who it is.

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import type { AlbumPhoto, Face } from '../types';
import { playRecording, speak, stopAll } from './voice';

const SLIDE_MS = 12_000;

export function PhotoAlbum({ photos, onHome }: { photos: AlbumPhoto[]; onHome: () => void }) {
  const [index, setIndex] = useState(0);
  const [slideshow, setSlideshow] = useState(false);
  const [shown, setShown] = useState<Face | null>(null);
  const [playing, setPlaying] = useState(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const count = photos.length;
  const photo = photos[Math.min(index, count - 1)];

  const go = (delta: number) => {
    stopAll();
    setShown(null);
    setIndex((i) => (i + delta + count) % count);
  };

  // Gentle slideshow. Any touch on the photo stops it.
  useEffect(() => {
    if (!slideshow || count < 2) return;
    const id = window.setInterval(() => {
      setShown(null);
      setIndex((i) => (i + 1) % count);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [slideshow, count]);

  useEffect(() => () => stopAll(), []);

  // Load the photos on either side, so "Next" and "Back" are instant.
  useEffect(() => {
    if (count < 2) return;
    for (const d of [1, -1]) new Image().src = photos[(index + d + count) % count].url;
  }, [index, count, photos]);

  if (!photo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 p-8 text-center">
        <p className="font-serif text-5xl text-cocoa">Your family is adding photos here.</p>
        <HomeButton onHome={onHome} />
      </div>
    );
  }

  async function tellWho(face: Face) {
    setSlideshow(false);
    setShown(face);
    setPlaying(true);
    if (face.voice_url) await playRecording(face.voice_url);
    else await speak(`This is ${face.name}${face.relation ? `, ${face.relation}` : ''}.`);
    setPlaying(false);
  }

  async function playMessage() {
    if (playing) {
      stopAll();
      setPlaying(false);
      return;
    }
    setSlideshow(false);
    setPlaying(true);
    if (photo.voice) await playRecording(photo.voice.url);
    else await speak([photo.caption, photo.when_text, photo.label].filter(Boolean).join('. '));
    setPlaying(false);
  }

  function onPointerDown(e: PointerEvent) {
    swipe.current = { x: e.clientX, y: e.clientY };
    if (slideshow) setSlideshow(false);
  }
  function onPointerUp(e: PointerEvent) {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
  }

  return (
    <div className="flex h-full flex-col bg-ink/[0.03]">
      {/* Top bar: Home always here; slideshow on the other side. */}
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-4">
        <HomeButton onHome={onHome} />
        {count > 1 && (
          <button
            onClick={() => setSlideshow((s) => !s)}
            className="min-h-[72px] rounded-3xl border-2 border-cocoa/20 bg-linen px-6 font-sans text-2xl font-semibold text-cocoa"
          >
            {slideshow ? '⏸ Stop slideshow' : '▶ Slideshow'}
          </button>
        )}
      </div>

      {/* The photo, with the people in it. */}
      <div
        className="relative min-h-0 flex-1 touch-pan-y select-none px-4 py-3"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <FittedPhoto key={photo.id} photo={photo} shown={shown} onFace={tellWho} />
        {count > 1 && (
          <>
            <NavArrow side="left" onClick={() => go(-1)} />
            <NavArrow side="right" onClick={() => go(1)} />
          </>
        )}
      </div>

      {/* Words: caption, when, who made it, and the family's message. */}
      <div className="shrink-0 px-6 pb-5 text-center">
        <p className="font-serif text-4xl leading-tight text-cocoa sm:text-5xl">{photo.caption || ' '}</p>
        {photo.when_text && <p className="mt-1 font-serif text-2xl text-umber sm:text-3xl">{photo.when_text}</p>}
        {photo.label && (
          <p className="mx-auto mt-2 inline-block rounded-full bg-gold/25 px-4 py-1 font-sans text-xl text-ink">
            🎨 {photo.label}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={playMessage}
            className="min-h-[72px] rounded-3xl bg-cocoa px-7 font-sans text-2xl font-semibold text-linen shadow-warm"
          >
            {playing ? '■ Stop' : photo.voice ? `▶ A message from ${photo.voice.by ?? 'family'}` : '🔊 Read this to me'}
          </button>
          {photo.faces.map((f) => (
            <button
              key={f.id}
              onClick={() => tellWho(f)}
              className="min-h-[72px] rounded-3xl border-2 border-gold bg-linen px-6 font-sans text-2xl font-semibold text-cocoa"
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeButton({ onHome }: { onHome: () => void }) {
  return (
    <button
      onClick={() => {
        stopAll();
        onHome();
      }}
      className="min-h-[72px] rounded-3xl bg-cocoa px-7 font-sans text-2xl font-semibold text-linen shadow-warm"
    >
      🏠 Home
    </button>
  );
}

function NavArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      className={`absolute top-1/2 flex h-24 w-24 -translate-y-1/2 items-center justify-center rounded-full bg-linen/90 font-sans text-5xl text-cocoa shadow-warm ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}

/** The image scaled to fit, with face rings placed exactly over the picture. */
function FittedPhoto({
  photo,
  shown,
  onFace,
}: {
  photo: AlbumPhoto;
  shown: Face | null;
  onFace: (f: Face) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    photo.width && photo.height ? { w: photo.width, h: photo.height } : null,
  );

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = size && natural ? Math.min(size.w / natural.w, size.h / natural.h) : 0;
  const w = natural ? natural.w * scale : 0;
  const h = natural ? natural.h * scale : 0;

  return (
    <div ref={box} className="flex h-full w-full items-center justify-center">
      <div className="relative motion-safe:animate-[fadein_700ms_ease-out]" style={scale ? { width: w, height: h } : undefined}>
        <img
          src={photo.url}
          alt={photo.caption}
          draggable={false}
          onLoad={(e) =>
            !natural && setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
          className={`rounded-3xl shadow-warm ${scale ? 'h-full w-full' : 'max-h-full max-w-full'}`}
        />
        {scale > 0 &&
          photo.faces.map((f) => {
            const d = Math.max(f.r * 2 * w, 88); // never smaller than a fingertip
            const active = shown?.id === f.id;
            return (
              <button
                key={f.id}
                aria-label={`Who is this? ${f.name}`}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={() => onFace(f)}
                className={`absolute rounded-full border-4 transition ${
                  active ? 'border-gold bg-gold/10 shadow-lamp' : 'border-linen/70'
                }`}
                style={{ left: f.x * w - d / 2, top: f.y * h - d / 2, width: d, height: d }}
              >
                {active && (
                  <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-3xl bg-ink/85 px-5 py-2 font-sans text-3xl font-semibold text-linen">
                    {f.name}
                    {f.relation && <span className="block text-xl font-normal">{f.relation}</span>}
                  </span>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}

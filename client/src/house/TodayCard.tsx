// Orientation, not a quiz: the day, the date, and who's coming — stated gently.

import type { TodayNote } from '../types';
import { speak } from './voice';

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function TodayCard({ now, today }: { now: Date; today: TodayNote | null }) {
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const date = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const visitors = today?.visitors.trim();
  const note = today?.note.trim();

  const sentence = [`${greeting(now)}. Today is ${weekday}, ${date}.`, visitors, note].filter(Boolean).join(' ');

  return (
    <button
      onClick={() => speak(sentence)}
      aria-label={`${sentence} Tap to hear this read aloud.`}
      className="w-full rounded-[2rem] border border-cocoa/10 bg-linen/90 px-8 py-6 text-left shadow-warm focus:outline-none focus-visible:ring-8 focus-visible:ring-gold/60"
    >
      <p className="font-sans text-2xl text-umber sm:text-3xl">{greeting(now)}</p>
      <p className="font-serif text-6xl leading-tight text-cocoa sm:text-7xl">{weekday}</p>
      <p className="font-serif text-3xl text-ink sm:text-4xl">{date}</p>
      {visitors && <p className="mt-4 font-sans text-2xl font-semibold text-plum sm:text-3xl">👋 {visitors}</p>}
      {note && <p className="mt-2 font-sans text-2xl text-ink sm:text-3xl">{note}</p>}
    </button>
  );
}

// The Family Studio: where family makes things and sends them to her iPad.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useApp, type StudioMode } from '../store';
import type { AlbumPhoto, Person } from '../types';
import { StoryhouseApp } from '../StoryhouseApp';
import { GrandmaHome } from '../house/GrandmaHome';
import { PhotosPanel } from './PhotosPanel';
import { PeoplePanel } from './PeoplePanel';
import { IpadPanel } from './IpadPanel';

type Tab = 'photos' | 'people' | 'ipad';

const MODES: { id: StudioMode; label: string }[] = [
  { id: 'studio', label: '🎨 Studio' },
  { id: 'preview', label: '📱 Her iPad' },
  { id: 'storyhouse', label: '🏠 Storyhouse rooms' },
];

export function StudioShell() {
  const { studioMode, setStudioMode, session } = useApp();

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-cocoa/10 bg-linen/90 px-4 py-2 font-sans backdrop-blur">
        <span className="mr-2 font-serif text-xl text-cocoa">Family Studio</span>
        {session?.demoMode && (
          <span className="rounded-full bg-ember/90 px-2 py-0.5 text-xs font-semibold text-linen">
            DEMO — fictional family
          </span>
        )}
        <nav className="ml-auto flex flex-wrap gap-1" aria-label="Studio sections">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setStudioMode(m.id)}
              aria-current={studioMode === m.id ? 'page' : undefined}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                studioMode === m.id ? 'bg-cocoa text-linen' : 'text-umber hover:bg-cream'
              }`}
            >
              {m.label}
            </button>
          ))}
          <button
            className="rounded-xl px-3 py-2 text-sm text-umber underline-offset-2 hover:underline"
            onClick={async () => {
              await api.logout().catch(() => {});
              window.location.reload();
            }}
          >
            Lock
          </button>
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {studioMode === 'studio' && <Studio />}
        {studioMode === 'storyhouse' && <StoryhouseApp />}
        {studioMode === 'preview' && <Preview />}
      </div>
    </div>
  );
}

function Studio() {
  const [tab, setTab] = useState<Tab>('photos');
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [people, setPeople] = useState<Person[]>([]);

  const reload = useCallback(async () => {
    const [ph, pe] = await Promise.all([api.studio.photos(), api.studio.people()]);
    setPhotos(ph.photos);
    setPeople(pe.people);
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'photos', label: `Photos & art (${photos.length})` },
    { id: 'people', label: `People (${people.length})` },
    { id: 'ipad', label: 'Her iPad & Today' },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-4">
        <div className="mb-6 flex flex-wrap gap-2 font-sans">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full border px-4 py-2 font-semibold ${
                tab === t.id ? 'border-cocoa bg-cocoa text-linen' : 'border-cocoa/20 bg-linen text-umber'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'photos' && <PhotosPanel photos={photos} people={people} reload={reload} />}
        {tab === 'people' && <PeoplePanel people={people} reload={reload} />}
        {tab === 'ipad' && <IpadPanel />}
      </div>
    </div>
  );
}

/** Exactly what her iPad shows, in an iPad-shaped frame. */
function Preview() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto p-4">
      <p className="font-sans text-sm text-umber">
        This is what her iPad shows right now (published items only).
      </p>
      <div
        className="relative w-full max-w-5xl overflow-hidden rounded-[2rem] border-[14px] border-ink shadow-warm"
        style={{ aspectRatio: '4 / 3', maxHeight: 'calc(100dvh - 9rem)' }}
      >
        <GrandmaHome />
      </div>
    </div>
  );
}

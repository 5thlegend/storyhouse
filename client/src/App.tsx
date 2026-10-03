import { useEffect } from 'react';
import { api } from './api';
import { useApp } from './store';
import { Nav } from './components/Nav';
import { LivingRoom } from './components/LivingRoom';
import { MemoryLibrary } from './components/MemoryLibrary';
import { MemoryDetail } from './components/MemoryDetail';
import { Gallery } from './components/Gallery';
import { Timeline } from './components/Timeline';
import { Vault } from './components/Vault';

function DemoBanner() {
  return (
    <div className="bg-ember/90 px-4 py-2 text-center font-sans text-sm font-semibold text-linen">
      DEMO MODE — these are fictional memories of “Margaret.” No real family data is shown.
    </div>
  );
}

function Header() {
  const { setView } = useApp();
  return (
    <header className="px-4 pt-6 text-center">
      <button onClick={() => setView('living-room')} className="inline-flex items-center gap-3">
        <img src="/icon.svg" alt="" className="h-10 w-10" aria-hidden />
        <span className="font-serif text-3xl tracking-wide text-cocoa">Storyhouse</span>
      </button>
      <p className="mt-1 font-serif text-lg italic text-umber/80">
        A home for the stories that make us who we are.
      </p>
    </header>
  );
}

export default function App() {
  const { view, health, setHealth, selectedMemoryId } = useApp();

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
    // Warm the model into VRAM as soon as the app opens, so the first
    // conversation turn is fast (fire-and-forget).
    api.warmup().catch(() => {});
  }, [setHealth]);

  return (
    <div className="relative z-10 flex min-h-full flex-col">
      {health?.demoMode && <DemoBanner />}
      <Header />

      <main className="flex-1">
        {view === 'living-room' && <LivingRoom />}
        {view === 'library' && <MemoryLibrary />}
        {view === 'gallery' && <Gallery />}
        {view === 'timeline' && <Timeline />}
        {view === 'vault' && <Vault />}
      </main>

      {selectedMemoryId && <MemoryDetail id={selectedMemoryId} />}

      <Nav />
    </div>
  );
}

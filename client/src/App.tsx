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
    <div className="shrink-0 bg-ember/90 px-4 py-1.5 text-center font-sans text-xs font-semibold text-linen sm:text-sm">
      DEMO MODE — fictional memories of “Margaret.” No real family data is shown.
    </div>
  );
}

function Header() {
  const { setView } = useApp();
  return (
    <header className="shrink-0 px-4 pt-2 text-center sm:pt-3">
      <button onClick={() => setView('living-room')} className="inline-flex items-center gap-2">
        <img src="/icon.svg" alt="" className="h-7 w-7 sm:h-9 sm:w-9" aria-hidden />
        <span className="font-serif text-2xl tracking-wide text-cocoa sm:text-3xl">Storyhouse</span>
      </button>
      <p className="hidden font-serif text-base italic text-umber/80 sm:block">
        A home for the stories that make us who we are.
      </p>
    </header>
  );
}

function FamilyBanner() {
  const { setAccess, setView } = useApp();
  async function leave() {
    try {
      await api.familyLogout();
    } catch {
      /* ignore */
    }
    setAccess('owner', true);
    setView('living-room');
  }
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 bg-plum/90 px-4 py-1.5 text-center font-sans text-xs font-semibold text-linen sm:text-sm">
      <span>👪 Family View — read-only. Grandma’s Living Room &amp; recording stay private to her.</span>
      <button onClick={leave} className="underline underline-offset-2">
        Leave
      </button>
    </div>
  );
}

export default function App() {
  const { view, health, setHealth, selectedMemoryId, role, setAccess, setView } = useApp();

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
    api
      .familyStatus()
      .then((s) => {
        setAccess(s.role, s.sharingEnabled);
        if (s.role === 'family') setView('library'); // the Living Room is owner-only
        else api.warmup().catch(() => {}); // only the owner needs the model warmed
      })
      .catch(() => api.warmup().catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHealth]);

  return (
    <div className="relative z-10 flex h-[100dvh] flex-col overflow-hidden">
      {role === 'family' && <FamilyBanner />}
      {health?.demoMode && role !== 'family' && <DemoBanner />}
      <Header />

      <main className="min-h-0 flex-1">
        {view === 'living-room' && role !== 'family' && <LivingRoom />}
        {view === 'living-room' && role === 'family' && <MemoryLibrary />}
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

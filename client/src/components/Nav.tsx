import { useApp, type View } from '../store';

const ROOMS: { id: View; label: string; icon: string }[] = [
  { id: 'living-room', label: 'Living Room', icon: '🛋️' },
  { id: 'library', label: 'Library', icon: '📖' },
  { id: 'gallery', label: 'Gallery', icon: '🖼️' },
  { id: 'timeline', label: 'Timeline', icon: '🕰️' },
  { id: 'vault', label: 'Vault', icon: '🔒' },
];

export function Nav() {
  const { view, setView, role } = useApp();
  const rooms = role === 'family' ? ROOMS.filter((r) => r.id !== 'living-room') : ROOMS;
  return (
    <nav
      className="sticky bottom-0 z-20 w-full border-t border-cocoa/10 bg-linen/90 backdrop-blur md:static md:border-t-0"
      aria-label="Rooms of the house"
    >
      <ul className="mx-auto flex max-w-3xl items-stretch justify-between gap-1 px-2 py-2">
        {rooms.map((r) => {
          const activeView = view === r.id;
          return (
            <li key={r.id} className="flex-1">
              <button
                onClick={() => setView(r.id)}
                aria-current={activeView ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-1 rounded-2xl px-2 py-2 font-sans text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-gold/60 ${
                  activeView ? 'bg-cocoa text-linen shadow-warm' : 'text-umber hover:bg-cream'
                }`}
              >
                <span className="text-2xl" aria-hidden>
                  {r.icon}
                </span>
                <span>{r.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

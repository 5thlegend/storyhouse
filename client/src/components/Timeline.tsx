import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';

export function Timeline() {
  const { openMemory } = useApp();
  const [decades, setDecades] = useState<
    { decade: string; memories: { id: string; title: string; when: string | null }[] }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .timeline()
      .then((r) => setDecades(r.decades))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="mx-auto h-full max-w-3xl overflow-y-auto px-4 pb-6 pt-4">
      <header className="mb-8 text-center">
        <h1 className="font-serif text-4xl text-cocoa">Life Timeline</h1>
        <p className="mt-2 font-serif text-xl text-umber/80">
          A life across the decades — dates kept exactly as she remembered them.
        </p>
      </header>

      {loading ? (
        <p className="py-16 text-center font-serif text-xl text-umber/70">Laying out the years…</p>
      ) : decades.length === 0 ? (
        <p className="py-16 text-center font-serif text-xl text-umber/70">No dated memories yet.</p>
      ) : (
        <div className="relative ml-4 border-l-2 border-gold/50 pl-8">
          {decades.map((d) => (
            <div key={d.decade} className="mb-10 last:mb-0">
              <div className="absolute -ml-[41px] mt-1 h-5 w-5 rounded-full border-4 border-linen bg-gold" />
              <h2 className="mb-3 font-serif text-3xl text-cocoa">{d.decade}</h2>
              <ul className="space-y-2">
                {d.memories.map((m) => (
                  <li key={m.id}>
                    <button
                      className="text-left font-serif text-xl text-plum hover:underline"
                      onClick={() => openMemory(m.id)}
                    >
                      {m.title}
                    </button>
                    {m.when && <span className="ml-2 text-umber/70">— {m.when}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

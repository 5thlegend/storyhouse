import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import type { Memory } from '../types';

export function Gallery() {
  const { openMemory } = useApp();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listMemories()])
      .then(async ([list]) => {
        // Fetch full detail (with artifacts) for memories that have art.
        const full = await Promise.all(
          list.memories.map((m) => api.getMemory(m.id).then((r) => r.memory)),
        );
        setMemories(full);
      })
      .finally(() => setLoading(false));
  }, []);

  const withArt = memories.filter((m) => (m.artifacts?.length ?? 0) > 0);

  return (
    <section className="mx-auto h-full max-w-4xl overflow-y-auto px-4 pb-6 pt-4">
      <header className="mb-6 text-center">
        <h1 className="font-serif text-4xl text-cocoa">Memory Gallery</h1>
        <p className="mt-2 font-serif text-xl text-umber/80">
          Visual interpretations of her stories.
        </p>
      </header>

      <div className="mb-6 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-center font-sans text-umber">
        🖼️ Every image here is an <strong>AI-generated visual interpretation</strong> created from
        Grandma’s words — never a historical photograph. Real family photos are kept separate and
        clearly labeled.
      </div>

      {loading ? (
        <p className="py-16 text-center font-serif text-xl text-umber/70">Opening the gallery…</p>
      ) : withArt.length === 0 ? (
        <p className="py-16 text-center font-serif text-xl text-umber/70">
          No interpretations yet. Open a memory and choose “Make a visual interpretation.”
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {withArt.map((m) =>
            m.artifacts!.map((a) => (
              <button
                key={a.id}
                onClick={() => openMemory(m.id)}
                className="overflow-hidden rounded-3xl border border-cocoa/10 bg-linen text-left shadow-warm transition hover:-translate-y-0.5 hover:shadow-lamp"
              >
                <img src={a.url} alt={a.label} className="w-full" />
                <div className="p-4">
                  <h3 className="font-serif text-xl text-cocoa">{m.title}</h3>
                  <p className="mt-1 font-sans text-sm text-ember">AI-generated interpretation</p>
                </div>
              </button>
            )),
          )}
        </div>
      )}
    </section>
  );
}

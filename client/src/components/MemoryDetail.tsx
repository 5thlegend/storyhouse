import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import type { Memory } from '../types';

export function MemoryDetail({ id }: { id: string }) {
  const { openMemory } = useApp();
  const [mem, setMem] = useState<Memory | null>(null);
  const [makingArt, setMakingArt] = useState(false);

  async function load() {
    const r = await api.getMemory(id);
    setMem(r.memory);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function makeArt() {
    setMakingArt(true);
    try {
      await api.makeArt(id);
      await load();
    } finally {
      setMakingArt(false);
    }
  }

  if (!mem) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40">
        <p className="font-serif text-xl text-linen">Opening memory…</p>
      </div>
    );
  }

  const hasConflict = (mem.recollections?.length ?? 0) > 1;

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-ink/50 p-4" onClick={() => openMemory(null)}>
      <article
        className="mx-auto my-6 max-w-2xl rounded-3xl bg-linen p-6 shadow-warm sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-serif text-3xl text-cocoa">{mem.title}</h2>
          <button
            onClick={() => openMemory(null)}
            className="btn-ghost !px-4 !py-2 !text-base"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        {mem.memory_date_text && (
          <p className="mb-4 font-serif text-xl text-umber">{mem.memory_date_text}</p>
        )}

        {/* Her words — immutable original */}
        <blockquote className="mb-5 rounded-2xl border-l-4 border-gold bg-cream px-5 py-4 font-serif text-xl italic leading-relaxed text-ink">
          “{mem.original_transcript}”
        </blockquote>

        {mem.summary && <p className="mb-5 text-ink/90">{mem.summary}</p>}

        {/* Conflicting / multiple recollections — both preserved */}
        {hasConflict && (
          <div className="mb-5 rounded-2xl border border-gold/40 bg-gold/10 p-4">
            <p className="mb-2 font-sans font-semibold text-umber">
              This memory has more than one recollection — we keep them all:
            </p>
            <ul className="space-y-2">
              {mem.recollections!.map((r) => (
                <li key={r.id} className="text-ink/90">
                  “{r.text}” <span className="chip ml-1">{r.confidence}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Memory art */}
        {(mem.artifacts?.length ?? 0) > 0 && (
          <div className="mb-5">
            {mem.artifacts!.map((a) => (
              <figure key={a.id} className="overflow-hidden rounded-2xl border border-cocoa/10">
                <img src={a.url} alt={a.label} className="w-full" />
                <figcaption className="bg-cream px-4 py-2 text-center font-sans text-sm text-umber">
                  {a.label}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {/* People / places / things */}
        {(mem.entities?.length ?? 0) > 0 && (
          <div className="mb-5">
            <h4 className="mb-2 font-sans font-semibold text-umber">In this memory</h4>
            <div className="flex flex-wrap gap-2">
              {mem.entities!.map((e) => (
                <span key={e.id} className="chip">
                  <span aria-hidden>{iconFor(e.kind)}</span> {e.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Related memories */}
        {(mem.related?.length ?? 0) > 0 && (
          <div className="mb-5">
            <h4 className="mb-2 font-sans font-semibold text-umber">Connected memories</h4>
            <ul className="space-y-1">
              {mem.related!.map((r) => (
                <li key={r.id}>
                  <button
                    className="text-left font-serif text-lg text-plum underline-offset-2 hover:underline"
                    onClick={() => openMemory(r.id)}
                  >
                    {r.title}
                  </button>
                  <span className="ml-2 text-sm text-umber/70">({r.relation})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Provenance — always visible */}
        <div className="mb-5 rounded-2xl bg-cream p-4 font-sans text-sm text-umber">
          <strong>Where this came from:</strong> {mem.provenance}{' '}
          <span className="chip ml-1">{mem.confidence}</span>
        </div>

        <div className="flex flex-wrap gap-3">
          {(mem.artifacts?.length ?? 0) === 0 && (
            <button className="btn-ghost !py-3 !text-base" onClick={makeArt} disabled={makingArt}>
              {makingArt ? 'Creating…' : '🖼️ Make a visual interpretation'}
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

function iconFor(kind: string): string {
  const m: Record<string, string> = {
    person: '👤',
    place: '📍',
    event: '✨',
    object: '📦',
    recipe: '🍽️',
    tradition: '🕯️',
    vehicle: '🚗',
    home: '🏠',
    job: '💼',
    school: '🎓',
    organization: '🏛️',
  };
  return m[kind] ?? '•';
}

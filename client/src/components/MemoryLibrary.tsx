import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import type { Memory } from '../types';

function ProvenanceBadge({ confidence }: { confidence: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    DIRECT: { label: 'Her words', cls: 'border-sage/40 bg-sage/10 text-sage' },
    APPROXIMATE: { label: 'She estimated', cls: 'border-gold/40 bg-gold/10 text-umber' },
    FAMILY_REPORTED: { label: 'From family', cls: 'border-plum/40 bg-plum/10 text-plum' },
    DERIVED: { label: 'Inferred', cls: 'border-cocoa/30 bg-cocoa/10 text-cocoa' },
    GENERATED: { label: 'AI-made', cls: 'border-ember/40 bg-ember/10 text-ember' },
    UNKNOWN: { label: 'Unknown', cls: 'border-cocoa/20 bg-cream text-umber' },
  };
  const m = map[confidence] ?? map.UNKNOWN;
  return <span className={`chip ${m.cls}`}>{m.label}</span>;
}

export function MemoryLibrary() {
  const { openMemory } = useApp();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ id: string; title: string; summary: string }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listMemories()
      .then((r) => setMemories(r.memories))
      .finally(() => setLoading(false));
  }, []);

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const r = await api.search(q);
      setResults(r.results);
    } finally {
      setSearching(false);
    }
  }

  const shown = results
    ? memories.filter((m) => results.some((r) => r.id === m.id))
    : memories;

  return (
    <section className="mx-auto h-full max-w-4xl overflow-y-auto px-4 pb-6 pt-4">
      <header className="mb-6 text-center">
        <h1 className="font-serif text-4xl text-cocoa">Memory Library</h1>
        <p className="mt-2 font-serif text-xl text-umber/80">
          Preserved stories — in her own words.
        </p>
      </header>

      <form onSubmit={doSearch} className="mb-6 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search memories… e.g. “Grandpa’s car”"
          aria-label="Search memories"
          className="flex-1 rounded-2xl border-2 border-cocoa/20 bg-linen px-4 py-3 text-lg focus:border-cocoa/50 focus:outline-none"
        />
        <button className="btn-primary" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
        {results && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setResults(null);
              setQ('');
            }}
          >
            Clear
          </button>
        )}
      </form>

      {loading ? (
        <p className="py-16 text-center font-serif text-xl text-umber/70">Opening the library…</p>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center font-serif text-xl text-umber/70">
          {results ? 'No memories matched that search.' : 'No memories yet. Start a conversation in the Living Room.'}
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {shown.map((m) => (
            <button
              key={m.id}
              onClick={() => openMemory(m.id)}
              className="card text-left transition hover:-translate-y-0.5 hover:shadow-lamp focus:outline-none focus-visible:ring-4 focus-visible:ring-gold/60"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="font-serif text-2xl text-cocoa">{m.title}</h3>
                {m.status === 'unfinished' && (
                  <span className="chip border-ember/40 bg-ember/10 text-ember">Unfinished</span>
                )}
              </div>
              {m.memory_date_text && (
                <p className="mb-2 font-serif text-umber/80">{m.memory_date_text}</p>
              )}
              <p className="mb-3 line-clamp-3 text-ink/90">{m.summary || m.original_transcript}</p>
              <div className="flex flex-wrap gap-2">
                <ProvenanceBadge confidence={m.confidence} />
                {(m.artifacts?.length ?? 0) > 0 && <span className="chip">🖼️ Art</span>}
                {m.entities?.slice(0, 2).map((e) => (
                  <span key={e.id} className="chip">
                    {e.name}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

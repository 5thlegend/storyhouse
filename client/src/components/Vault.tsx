import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import type { VaultStats } from '../types';

function Stat({ n, label, icon }: { n: number; label: string; icon: string }) {
  return (
    <div className="card flex flex-col items-center py-5 text-center">
      <span className="text-3xl" aria-hidden>
        {icon}
      </span>
      <span className="mt-1 font-serif text-4xl text-cocoa">{n}</span>
      <span className="font-sans text-umber">{label}</span>
    </div>
  );
}

export function Vault() {
  const { role, sharingEnabled } = useApp();
  const [stats, setStats] = useState<VaultStats | null>(null);

  useEffect(() => {
    api.vault().then((r) => setStats(r.stats));
  }, []);

  async function openFamilyView() {
    const code = window.prompt('Enter the family passcode to open the read-only Family View:');
    if (!code) return;
    try {
      await api.familyUnlock(code);
      window.location.reload();
    } catch {
      window.alert('That passcode did not match.');
    }
  }

  return (
    <section className="mx-auto h-full max-w-3xl overflow-y-auto px-4 pb-6 pt-4">
      <header className="mb-6 text-center">
        <h1 className="font-serif text-4xl text-cocoa">Memory Vault</h1>
        <p className="mt-2 font-serif text-xl text-umber/80">
          This archive belongs to the family — not to any AI company.
        </p>
      </header>

      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat n={stats.memories} label="Memories" icon="📖" />
          <Stat n={stats.people} label="People" icon="👤" />
          <Stat n={stats.places} label="Places" icon="📍" />
          <Stat n={stats.recipes} label="Recipes" icon="🍽️" />
          <Stat n={stats.unfinished} label="Unfinished" icon="…" />
          <Stat n={stats.artifacts} label="Artworks" icon="🖼️" />
        </div>
      )}

      <div className="card mb-6">
        <h3 className="mb-3 font-serif text-2xl text-cocoa">Your archive, your ownership</h3>
        <p className="mb-4 text-ink/90">
          Storyhouse runs its intelligence on an <strong>open-weight model</strong>, and the Memory
          Vault is a plain database you can export and keep forever. Download everything — in her own
          words — any time.
        </p>
        <div className="flex flex-wrap gap-3">
          <a className="btn-primary" href={api.exportPdfUrl} download>
            📖 Download storybook (PDF)
          </a>
          <a className="btn-ghost" href={api.exportUrl} download>
            ⬇ Archive (JSON)
          </a>
          <a className="btn-ghost" href={api.exportMarkdownUrl} download>
            ⬇ Markdown
          </a>
        </div>
      </div>

      {role !== 'family' && (
        <div className="card mb-6">
          <h3 className="mb-3 font-serif text-2xl text-cocoa">Family sharing</h3>
          {sharingEnabled ? (
            <>
              <p className="mb-4 text-ink/90">
                Family can open a <strong>read-only Family View</strong> — the Library, Gallery,
                Timeline and Vault — with the family passcode. Grandma’s <strong>Living Room
                conversation, microphone, and editing stay private to her</strong>, and anything
                marked private is never shown. It all runs on this device; nothing is uploaded.
              </p>
              <button className="btn-ghost" onClick={openFamilyView}>
                👪 Open Family View (read-only)
              </button>
            </>
          ) : (
            <p className="text-ink/90">
              Family sharing is currently <strong>off</strong>. To let family view the archive
              read-only, set a <code>FAMILY_PASSCODE</code> on this device. Storage stays local —
              on your home network, or privately over a Cloudflare Tunnel.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h3 className="mb-3 font-serif text-2xl text-cocoa">Privacy &amp; honesty</h3>
        <ul className="space-y-2 text-ink/90">
          <li>🔒 Memories are stored locally and never used to train any model.</li>
          <li>🎙️ The microphone only listens when you tap it. Nothing is recorded in secret.</li>
          <li>🧭 Every memory shows where it came from — her words, an estimate, or an AI inference.</li>
          <li>🖼️ AI-made images are always labeled as interpretations, never as real photographs.</li>
          <li>👪 Family can read and export; the archive is never locked away from them.</li>
        </ul>
      </div>
    </section>
  );
}

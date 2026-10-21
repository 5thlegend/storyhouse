// Set up her iPad once, see which iPads are paired, and fill in today's card.

import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Device } from '../types';
import { localDate } from '../house/dates';

export function IpadPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = () => api.studio.devices().then((r) => setDevices(r.devices));
  useEffect(() => {
    loadDevices().catch(() => {});
  }, []);

  async function newCode() {
    setError(null);
    try {
      setCode(await api.studio.pairingCode());
    } catch (err: any) {
      setError(err?.message ?? 'Could not create a code.');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card font-sans">
        <h2 className="mb-3 font-serif text-2xl text-cocoa">Set up her iPad</h2>
        <ol className="mb-4 list-decimal space-y-2 pl-5 text-ink/90">
          <li>
            On her iPad, open <strong>Safari</strong> and go to <code className="break-all">{window.location.origin}</code>
          </li>
          <li>
            Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, then open Storyhouse from the Home Screen.
          </li>
          <li>
            Tap <strong>Set up Grandma’s iPad</strong> and type the code below. She’ll never need to log in.
          </li>
          <li>
            Optional: turn on <strong>Guided Access</strong> (Settings → Accessibility) and triple-click the side button
            inside Storyhouse to keep her in the app.
          </li>
        </ol>
        {code ? (
          <div className="rounded-2xl border-2 border-dashed border-gold bg-gold/10 p-5 text-center">
            <p className="font-mono text-4xl font-bold tracking-[0.2em] text-cocoa">{code.code}</p>
            <p className="mt-2 text-sm text-umber">
              Works once, until {new Date(code.expires_at).toLocaleString()}.
            </p>
          </div>
        ) : (
          <button className="btn-primary" onClick={newCode}>
            Get a setup code
          </button>
        )}
        {error && <p className="mt-2 text-ember">{error}</p>}

        <h3 className="mb-2 mt-6 font-serif text-xl text-cocoa">Paired iPads</h3>
        {devices.length === 0 && <p className="text-umber">None yet.</p>}
        <ul className="space-y-2">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-xl bg-cream/70 px-3 py-2">
              <span className="flex-1">
                <strong>{d.label}</strong>
                <span className="block text-xs text-umber">
                  Paired {new Date(d.created_at).toLocaleDateString()}
                  {d.last_seen_at ? ` · last opened ${new Date(d.last_seen_at).toLocaleString()}` : ''}
                </span>
              </span>
              <button
                className="text-sm text-ember underline"
                onClick={async () => {
                  if (!window.confirm('Forget this iPad? It will go back to the lock screen.')) return;
                  await api.studio.forgetDevice(d.id);
                  await loadDevices();
                }}
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
      </div>

      <TodayEditor />
    </div>
  );
}

function TodayEditor() {
  const [date, setDate] = useState(localDate());
  const [visitors, setVisitors] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
    api
      .today(date)
      .then((t) => {
        setVisitors(t.visitors);
        setNote(t.note);
      })
      .catch(() => {});
  }, [date]);

  return (
    <div className="card font-sans">
      <h2 className="mb-1 font-serif text-2xl text-cocoa">Her Today card</h2>
      <p className="mb-4 text-sm text-umber">
        Shown at the top of her home screen on that day only. Gentle facts, never questions.
      </p>
      <label className="mb-3 block text-sm text-umber">
        Day
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink"
        />
      </label>
      <label className="mb-3 block text-sm text-umber">
        Who’s visiting
        <input
          value={visitors}
          onChange={(e) => setVisitors(e.target.value)}
          placeholder="e.g. Danny is coming for lunch"
          className="mt-1 block w-full rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink"
        />
      </label>
      <label className="mb-4 block text-sm text-umber">
        A gentle note
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Your hair appointment is at 2 o’clock"
          className="mt-1 block w-full rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink"
        />
      </label>
      <button
        className="btn-primary"
        onClick={async () => {
          await api.studio.setToday({ date, visitors, note });
          setSaved(true);
        }}
      >
        Save
      </button>
      {saved && <span className="ml-3 text-sage">Saved ✓</span>}
    </div>
  );
}

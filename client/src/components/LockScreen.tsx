// The only thing a stranger ever sees. Two doors:
//   "Set up Grandma's iPad" — a one-time code from the Family Studio
//   "Family Studio"         — the family passcode

import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useApp } from '../store';

type Door = 'choose' | 'ipad' | 'studio';

export function LockScreen() {
  const { session } = useApp();
  const [door, setDoor] = useState<Door>('choose');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (door === 'ipad') await api.pair(value.trim());
      else await api.unlock(value);
      window.location.reload();
    } catch (err: any) {
      setError(err?.message ?? 'That didn’t work.');
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
      <img src="/icon.svg" alt="" className="mb-4 h-20 w-20" aria-hidden />
      <h1 className="font-serif text-5xl text-cocoa">Storyhouse</h1>
      <p className="mt-2 font-serif text-xl italic text-umber/80">A private home for one family’s stories.</p>

      {session && !session.configured && (
        <p className="mt-8 max-w-md rounded-2xl border border-ember/40 bg-ember/10 p-4 font-sans text-ember">
          This Storyhouse isn’t set up yet. Set <code>STUDIO_PASSCODE</code> and <code>SESSION_SECRET</code>{' '}
          (see docs/deployment.md).
        </p>
      )}

      {door === 'choose' ? (
        <div className="mt-10 flex w-full max-w-md flex-col gap-4">
          <button className="btn-primary min-h-[72px] text-xl" onClick={() => setDoor('ipad')}>
            📱 Set up Grandma’s iPad
          </button>
          <button className="btn-ghost min-h-[72px] text-xl" onClick={() => setDoor('studio')}>
            🔑 Family Studio
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-10 flex w-full max-w-md flex-col gap-4">
          <label className="font-sans text-lg text-umber" htmlFor="lock-input">
            {door === 'ipad'
              ? 'Type the setup code from the Family Studio. You only do this once.'
              : session?.familyViewEnabled
                ? 'Family Studio or Family View passcode'
                : 'Family Studio passcode'}
          </label>
          <input
            id="lock-input"
            autoFocus
            type={door === 'ipad' ? 'text' : 'password'}
            autoCapitalize={door === 'ipad' ? 'characters' : 'off'}
            autoComplete={door === 'ipad' ? 'off' : 'current-password'}
            placeholder={door === 'ipad' ? 'ABCD-EFGH' : ''}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rounded-2xl border-2 border-cocoa/20 bg-linen px-5 py-4 text-center font-sans text-2xl tracking-widest text-ink focus:border-gold focus:outline-none"
          />
          {error && <p className="font-sans text-ember">{error}</p>}
          <button className="btn-primary min-h-[64px] text-xl" disabled={busy}>
            {busy ? 'One moment…' : door === 'ipad' ? 'Set up this iPad' : 'Open'}
          </button>
          <button
            type="button"
            className="font-sans text-umber underline underline-offset-4"
            onClick={() => {
              setDoor('choose');
              setValue('');
              setError(null);
            }}
          >
            Back
          </button>
        </form>
      )}
    </div>
  );
}

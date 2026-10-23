// Record a real family voice for Grandma: "Hi Grandma, it's me…".
// Every recording carries the name of who is speaking, and she is always told.
// Storyhouse never imitates or synthesizes a relative's voice.

import { useEffect, useRef, useState } from 'react';

// iPad Safari only plays some formats; prefer MP4/AAC when the browser can record it.
const MIME_PREFERENCE = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];

export function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported(m));
}

const NAME_KEY = 'sh_my_name';

function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function VoiceRecorder({
  existingUrl,
  existingBy,
  prompt,
  onSave,
  onClear,
}: {
  existingUrl: string | null;
  existingBy: string | null;
  prompt: string;
  onSave: (audio: Blob, recordedBy: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'review' | 'saving'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string } | null>(null);
  const [by, setBy] = useState(rememberedName);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/mp4' });
        setTake({ blob, url: URL.createObjectURL(blob) });
        setState('review');
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      setState('recording');
    } catch {
      setError('The microphone isn’t available. Check the browser’s microphone permission.');
    }
  }

  function stop() {
    if (timer.current) window.clearInterval(timer.current);
    recorder.current?.stop();
  }

  async function save() {
    if (!take || !by.trim()) return;
    setState('saving');
    try {
      localStorage.setItem(NAME_KEY, by.trim());
    } catch {
      /* ignore */
    }
    try {
      await onSave(take.blob, by.trim());
      setTake(null);
      setState('idle');
    } catch (err: any) {
      setError(err?.message ?? 'Could not save the recording.');
      setState('review');
    }
  }

  return (
    <div className="rounded-2xl border border-cocoa/15 bg-cream/60 p-4 font-sans">
      <p className="mb-3 text-sm text-umber">{prompt}</p>

      {existingUrl && state === 'idle' && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <audio controls src={existingUrl} className="h-10 max-w-full" />
          <span className="text-sm text-umber">Recorded by {existingBy ?? 'family'}</span>
          <button className="text-sm text-ember underline" onClick={() => onClear()}>
            Remove
          </button>
        </div>
      )}

      {state === 'idle' && (
        <button className="btn-ghost py-3" onClick={start}>
          🎙️ {existingUrl ? 'Record a new one' : 'Record'}
        </button>
      )}

      {state === 'recording' && (
        <button className="btn-primary bg-ember py-3 hover:bg-ember/90" onClick={stop}>
          ⏹ Stop ({seconds}s)
        </button>
      )}

      {(state === 'review' || state === 'saving') && take && (
        <div className="flex flex-col gap-3">
          <audio controls src={take.url} className="h-10 max-w-full" />
          <label className="text-sm text-umber">
            Who is speaking? <span className="text-umber/70">(she’ll be told)</span>
            <input
              value={by}
              onChange={(e) => setBy(e.target.value)}
              placeholder="e.g. Danny"
              className="mt-1 block w-full rounded-xl border border-cocoa/20 bg-linen px-3 py-2 text-ink"
            />
          </label>
          <div className="flex gap-3">
            <button className="btn-primary py-3" disabled={!by.trim() || state === 'saving'} onClick={save}>
              {state === 'saving' ? 'Saving…' : 'Save recording'}
            </button>
            <button
              className="btn-ghost py-3"
              onClick={() => {
                setTake(null);
                setState('idle');
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-ember">{error}</p>}
    </div>
  );
}

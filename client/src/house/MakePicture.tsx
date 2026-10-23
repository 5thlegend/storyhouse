// "Make a picture." She says what she'd like to see (or taps an idea from her
// own memories), checks what was heard, and Flux paints it. She never types.

import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ArtIdea, Painting } from '../types';
import { useListen } from './useListen';
import { speak } from './voice';

const BIG = 'min-h-[72px] rounded-3xl px-7 font-sans text-2xl font-semibold shadow-warm';
const DARK = `${BIG} bg-cocoa text-linen`;
const LIGHT = `${BIG} border-2 border-cocoa/20 bg-linen text-cocoa`;

type Step =
  | { name: 'ask'; missed?: boolean }
  | { name: 'heard'; text: string }
  | { name: 'painting'; what: string }
  | { name: 'result'; painting: Painting; caption: string; fromIdea: boolean }
  | { name: 'kept'; url: string };

export function MakePicture({ ideas, canPaint, onKept }: { ideas: ArtIdea[]; canPaint: boolean; onKept: () => void }) {
  const [step, setStep] = useState<Step>({ name: 'ask' });
  const listen = useListen((text) => {
    if (text) {
      setStep({ name: 'heard', text });
      speak(`You said: ${text}. Shall I paint it?`);
    } else {
      setStep({ name: 'ask', missed: true });
      speak("I didn't quite catch that. Let's try again, or pick one below.");
    }
  });

  useEffect(() => {
    speak('Tell me what you would like to see, and I will paint it.');
  }, []);

  async function paint(input: { text?: string; idea?: string }, what: string) {
    setStep({ name: 'painting', what });
    let painting: Painting | null = null;
    try {
      painting = (await api.paintWords(input)).painting;
    } catch {
      painting = null;
    }
    if (painting) {
      setStep({ name: 'result', painting, caption: painting.title || what, fromIdea: !!input.idea });
      speak('Here is your picture.');
    } else {
      setStep({ name: 'ask', missed: true });
      speak("Let's try a different one.");
    }
  }

  async function keep(p: Painting, caption: string) {
    try {
      await api.keepPainting(p.key, caption);
      setStep({ name: 'kept', url: p.url });
      speak('Lovely. Your picture is saved, and your family can see it.');
      onKept();
    } catch {
      setStep({ name: 'ask', missed: true });
    }
  }

  function another(p?: Painting) {
    if (p) api.discardPainting(p.key).catch(() => {});
    setStep({ name: 'ask' });
  }

  if (!canPaint) {
    return <p className="pt-10 text-center font-serif text-3xl text-umber">Let’s make more pictures tomorrow. You can color one now!</p>;
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {step.name === 'ask' && (
        <>
          <p className="font-serif text-4xl text-cocoa">
            {step.missed ? 'Let’s try that again.' : 'What would you like to see?'}
          </p>
          {listen.state === 'listening' ? (
            <>
              <div className="h-28 w-28 animate-pulse rounded-full bg-ember/70" aria-hidden />
              <button onClick={listen.stop} className={DARK}>
                ✓ That’s it
              </button>
            </>
          ) : listen.state === 'thinking' ? (
            <p className="font-serif text-3xl text-umber">Listening…</p>
          ) : (
            listen.state !== 'nomic' && (
              <>
                <button onClick={listen.start} className="flex h-40 w-40 items-center justify-center rounded-full bg-ember text-7xl text-linen shadow-warm" aria-label="Tell me what to paint">
                  🎙️
                </button>
                <p className="font-sans text-2xl text-umber">Tap, then say it. Like “a garden full of roses.”</p>
              </>
            )
          )}
          {ideas.length > 0 && (
            <>
              <p className="mt-4 font-sans text-2xl text-umber">Or pick one:</p>
              <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-2">
                {ideas.map((idea) => (
                  <button
                    key={idea.id}
                    onClick={() => paint({ idea: idea.id }, idea.title)}
                    className="min-h-[96px] rounded-3xl border-2 border-gold bg-linen p-5 text-left font-serif text-3xl text-cocoa shadow-warm"
                  >
                    {idea.title}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {step.name === 'heard' && (
        <>
          <p className="font-sans text-2xl text-umber">You said:</p>
          <p className="font-serif text-5xl text-cocoa">“{step.text}”</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => paint({ text: step.text }, step.text)} className={DARK}>
              ✨ Paint it
            </button>
            <button onClick={() => setStep({ name: 'ask' })} className={LIGHT}>
              Say it again
            </button>
          </div>
        </>
      )}

      {step.name === 'painting' && (
        <div className="flex flex-col items-center gap-6 pt-10">
          <div className="h-24 w-24 animate-pulse rounded-full bg-gold/60" aria-hidden />
          <p className="font-serif text-4xl text-cocoa">Painting your picture…</p>
          <p className="font-sans text-2xl text-umber">{step.what}</p>
        </div>
      )}

      {step.name === 'result' && (
        <>
          <img src={step.painting.url} alt={step.caption} className="max-h-[56vh] rounded-3xl shadow-warm" />
          <p className="font-sans text-xl text-umber">Painted with AI from your {step.fromIdea ? 'idea' : 'words'}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => keep(step.painting, step.caption)} className={DARK}>
              ✓ Keep it
            </button>
            <button onClick={() => another(step.painting)} className={LIGHT}>
              Make another
            </button>
          </div>
        </>
      )}

      {step.name === 'kept' && (
        <>
          <img src={step.url} alt="Your picture" className="max-h-[50vh] rounded-3xl shadow-warm" />
          <p className="font-serif text-4xl text-cocoa">Lovely! It’s saved.</p>
          <p className="font-sans text-2xl text-umber">Your family can see it.</p>
          <button onClick={() => setStep({ name: 'ask' })} className={DARK}>
            Make another picture
          </button>
        </>
      )}
    </div>
  );
}

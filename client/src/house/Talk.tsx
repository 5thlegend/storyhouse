// "Talk with me": a hands-free conversation with her companion. No buttons to
// hold, no turns to take. She just talks; it listens, answers in a warm voice,
// and listens again.
//
// When she talks over it (the "soften, finish, listen" rule):
//   1. the instant she starts, the companion drops to a murmur;
//   2. if it was just an "mm-hm", it comes back up and carries on;
//   3. if she keeps talking, it finishes only the sentence it's on, softly,
//      then stops and listens. It never cuts off mid-word, never talks louder
//      to win, and remembers that she didn't hear the rest.
// If she pauses for two minutes it rests the microphone, and one tap wakes it.
// Nothing she says is saved as a story unless she taps "Keep this story".

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { openEars, type Ears } from './ears';
import {
  duck,
  finishSentence,
  getLoudness,
  isSpeaking,
  louder,
  onVoice,
  say,
  softer,
  speak,
  stopAll,
  unduck,
  warm,
} from './voice';

const BIG = 'min-h-[76px] rounded-3xl px-8 font-sans text-2xl font-semibold shadow-warm';
const DARK = `${BIG} bg-cocoa text-linen`;
const LIGHT = `${BIG} border-2 border-cocoa/20 bg-linen text-cocoa`;

const KEEP_AFTER_WORDS = 30; // offer "Keep this story" once she has told something
const REST_AFTER_MS = 2 * 60_000;
const BACKCHANNEL_MS = 900; // shorter than this, while it talks, is an "mm-hm"

const MISSED = "I'm sorry, I didn't quite catch that. Could you say it again?";
const LOST = "I'm sorry, I lost my train of thought. Could you tell me again?";
const RESTING = "I'll be right here whenever you'd like to talk.";
const BACK = "I'm here. What would you like to talk about?";

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name}! It's so nice to see you. What's on your mind today?`;
}

type Phase = 'starting' | 'live' | 'resting' | 'nomic';

export function Talk({ onHome }: { onHome: () => void }) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [hearing, setHearing] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [canKeep, setCanKeep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loud, setLoud] = useState(getLoudness());

  const orb = useRef<HTMLDivElement>(null);
  const ears = useRef<Ears | null>(null);
  const conv = useRef<string | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const cutText = useRef<string | null>(null); // what she heard of a reply she talked over
  const overlap = useRef<{ timer: number; cutting: boolean } | null>(null);
  const lastActivity = useRef(Date.now());
  const wordsSinceKeep = useRef(0);
  const misses = useRef(0);
  const herName = useRef('Grandma');
  const alive = useRef(true);

  // Captions follow the voice, sentence by sentence.
  useEffect(
    () =>
      onVoice((s) => {
        setCaption(s.speaking ? s.sentence : null);
        if (s.speaking) setThinking(false); // "Let me think…" until she actually hears the voice
        else lastActivity.current = Date.now();
      }),
    [],
  );

  // ---------- one turn ----------
  async function sendTurn(wav: Blob) {
    const ac = new AbortController();
    inflight.current = ac;
    setThinking(true);
    const heardBeforeCut = cutText.current;
    cutText.current = null;
    let reply: ReturnType<typeof say> | null = null;
    let heard = '';
    let failed = false;
    try {
      await api.talk(
        { audio: wav, conversation: conv.current, heardBeforeCut },
        (ev) => {
          if (ac.signal.aborted) return;
          if (ev.type === 'conv') conv.current = ev.id;
          else if (ev.type === 'heard') heard = ev.text;
          else if (ev.type === 'error') failed = true;
          else if (ev.type === 'token') {
            if (!reply) {
              reply = say();
              reply.done.then((r) => {
                setThinking(false);
                // She talked over it: remember what she actually heard.
                if (r.interrupted) cutText.current = r.spoken;
                lastActivity.current = Date.now();
              });
            }
            reply.push(ev.text);
          }
        },
        ac.signal,
      );
    } catch {
      failed = true;
    }
    if (ac.signal.aborted || !alive.current) return;
    inflight.current = null;
    if (!reply) setThinking(false);
    if (reply) {
      (reply as ReturnType<typeof say>).end();
      misses.current = 0;
    } else if (!heard) {
      // Nothing clear came through. Ask once or twice, then just keep listening quietly.
      if (++misses.current <= 2) speak(MISSED);
      return;
    } else if (failed) {
      speak(LOST);
    }
    if (heard) {
      wordsSinceKeep.current += heard.split(/\s+/).length;
      if (wordsSinceKeep.current >= KEEP_AFTER_WORDS) setCanKeep(true);
    }
  }

  // ---------- her voice ----------
  async function listen() {
    ears.current?.close();
    ears.current = await openEars({
      onLevel: (level) => {
        if (orb.current) orb.current.style.transform = `scale(${1 + level * 0.22})`;
      },
      onStart: () => {
        lastActivity.current = Date.now();
        setHearing(true);
        if (isSpeaking()) {
          duck();
          const o = {
            cutting: false,
            timer: window.setTimeout(() => {
              if (ears.current?.voicing) {
                o.cutting = true;
                finishSentence();
              } else {
                unduck(); // a short sound, not her talking
              }
            }, BACKCHANNEL_MS),
          };
          overlap.current = o;
        } else if (inflight.current) {
          // She's adding more while it thinks: let her finish, and answer everything together.
          inflight.current.abort();
          inflight.current = null;
          setThinking(false);
        }
      },
      onUtterance: (wav, voicedMs) => {
        setHearing(false);
        lastActivity.current = Date.now();
        const o = overlap.current;
        overlap.current = null;
        if (o) {
          window.clearTimeout(o.timer);
          if (!o.cutting && voicedMs < BACKCHANNEL_MS && isSpeaking()) {
            unduck(); // "mm-hm" — carry on
            return;
          }
        }
        void sendTurn(wav);
      },
      onDiscard: () => {
        setHearing(false);
        const o = overlap.current;
        overlap.current = null;
        if (o) {
          window.clearTimeout(o.timer);
          if (!o.cutting) unduck();
        }
      },
    });
  }

  async function begin(first: boolean) {
    setPhase('starting');
    try {
      await listen();
    } catch {
      setPhase('nomic');
      speak('To talk with me, the microphone needs to be turned on. Ask your family to help with that.');
      return;
    }
    if (!alive.current) return ears.current?.close();
    lastActivity.current = Date.now();
    setPhase('live');
    speak(first ? greeting(herName.current) : BACK);
  }

  function rest(sayGoodbye: boolean) {
    ears.current?.close();
    ears.current = null;
    inflight.current?.abort();
    inflight.current = null;
    setHearing(false);
    setThinking(false);
    stopAll();
    setPhase('resting');
    if (sayGoodbye) speak(RESTING);
  }

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    warm(MISSED, BACK, RESTING);
    api
      .voice()
      .then((v) => (herName.current = v.herName || 'Grandma'))
      .catch(() => {})
      .finally(() => !cancelled && begin(true));

    // Rest the microphone when she's been quiet a while, or the iPad is put away.
    const idle = window.setInterval(() => {
      if (ears.current && !ears.current.hearing && !isSpeaking() && !inflight.current) {
        if (Date.now() - lastActivity.current > REST_AFTER_MS) rest(true);
      }
    }, 5000);
    const onHidden = () => document.visibilityState === 'hidden' && ears.current && rest(false);
    document.addEventListener('visibilitychange', onHidden);

    return () => {
      cancelled = true;
      alive.current = false;
      window.clearInterval(idle);
      document.removeEventListener('visibilitychange', onHidden);
      ears.current?.close();
      inflight.current?.abort();
      stopAll();
      if (conv.current) api.endTalk(conv.current).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function keep() {
    if (!conv.current) return;
    setSaving(true);
    try {
      const r = await api.keepStory(conv.current);
      if (r.saved) {
        wordsSinceKeep.current = 0;
        setCanKeep(false);
        speak('I’ve kept that story for your family to treasure.');
      } else {
        speak("Let's talk a little more first, and then I'll keep it.");
      }
    } catch {
      speak("Let's try keeping it again in a little while.");
    }
    setSaving(false);
  }

  function changeLoudness(up: boolean) {
    setLoud(up ? louder() : softer());
    if (!isSpeaking()) speak(up ? 'Is this better?' : 'Is this more comfortable?');
  }

  const status =
    phase === 'nomic'
      ? 'The microphone is off.'
      : phase === 'resting'
        ? 'Resting'
        : phase === 'starting'
          ? ''
          : hearing
            ? 'I’m listening…'
            : thinking
              ? 'Let me think…'
              : caption
                ? null
                : 'Go ahead, I’m listening.';

  const orbColor =
    phase !== 'live'
      ? 'from-cocoa/40 to-umber/30'
      : hearing
        ? 'from-sage to-gold/70'
        : caption
          ? 'from-gold to-ember/70'
          : thinking
            ? 'from-plum/80 to-gold/50'
            : 'from-gold/70 to-sage/50';

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-4">
        <button onClick={onHome} className={DARK}>
          🏠 Home
        </button>
        <h1 className="font-serif text-4xl text-cocoa sm:text-5xl">Talk with me</h1>
        <div className="flex gap-2">
          <button
            onClick={() => changeLoudness(false)}
            disabled={loud === 'softer'}
            className={`${LIGHT} px-5 disabled:opacity-40`}
            aria-label="Softer"
          >
            🔉
          </button>
          <button
            onClick={() => changeLoudness(true)}
            disabled={loud === 'louder'}
            className={`${LIGHT} px-5 disabled:opacity-40`}
            aria-label="Louder"
          >
            🔊
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
        <div className="relative flex h-56 w-56 items-center justify-center sm:h-72 sm:w-72">
          {phase === 'live' && (hearing || caption) && (
            <span className="absolute inset-0 animate-ping rounded-full bg-gold/20 [animation-duration:2.4s]" aria-hidden />
          )}
          <div
            ref={orb}
            className={`h-full w-full rounded-full bg-gradient-to-br shadow-warm transition-transform duration-100 ${orbColor} ${
              thinking ? 'animate-pulse' : ''
            }`}
            aria-hidden
          />
        </div>

        <p className="min-h-[2.5em] max-w-4xl font-serif text-4xl leading-snug text-cocoa sm:text-5xl" aria-live="polite">
          {status ?? caption}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-4 px-5 pb-8">
        {phase === 'live' && (
          <button onClick={() => rest(false)} className={LIGHT}>
            ⏸ Pause
          </button>
        )}
        {(phase === 'resting' || phase === 'nomic') && (
          <button onClick={() => begin(false)} className={`${DARK} min-h-[96px] px-12 text-3xl`}>
            🎙️ Talk with me
          </button>
        )}
        {phase === 'live' && canKeep && (
          <button onClick={keep} disabled={saving} className={`${DARK} bg-sage disabled:opacity-60`}>
            {saving ? 'Keeping it…' : '💛 Keep this story'}
          </button>
        )}
      </div>
    </div>
  );
}

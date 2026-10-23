// Sound on her iPad. One thing plays at a time: a family member's own recorded
// voice, or Storyhouse's own voice — a natural, clearly-not-family voice
// (Deepgram Aura on the family's Cloudflare account) — never a voice made to
// sound like a relative.
//
// Speech plays through Web Audio, because iPads ignore the volume of plain
// <audio>: that lets her pick Softer / Louder, and lets the companion go quiet
// the instant she starts talking. Replies are spoken sentence by sentence as
// they arrive, the next sentence fetched while the current one plays. If the
// voice can't be reached, the iPad's own built-in voice reads instead.

type Loudness = 'softer' | 'normal' | 'louder';
const LEVELS: Record<Loudness, number> = { softer: 0.45, normal: 0.75, louder: 1 };
const DUCKED = 0.22; // how quiet she hears it while she's talking over it

// ---------- the audio graph: clip → duck → master → speaker ----------
let ctx: AudioContext | null = null;
let duckGain: GainNode | null = null;
let masterGain: GainNode | null = null;

export function audioContext(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    ctx = new AC() as AudioContext;
    masterGain = ctx.createGain();
    masterGain.gain.value = LEVELS[getLoudness()];
    masterGain.connect(ctx.destination);
    duckGain = ctx.createGain();
    duckGain.connect(masterGain);
  }
  return ctx;
}

// iPads only start sound after a touch, and may suspend it later (a call,
// the lock screen). Every tap quietly wakes it.
function wake() {
  const c = audioContext();
  if (c.state !== 'running') c.resume().catch(() => {});
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', wake, true);
  document.addEventListener('touchend', wake, true);
}

// ---------- loudness ----------
export function getLoudness(): Loudness {
  try {
    const v = localStorage.getItem('sh-loudness');
    if (v === 'softer' || v === 'normal' || v === 'louder') return v;
  } catch {
    /* private mode */
  }
  return 'normal';
}

export function setLoudness(l: Loudness) {
  try {
    localStorage.setItem('sh-loudness', l);
  } catch {
    /* fine */
  }
  if (masterGain && ctx) masterGain.gain.setTargetAtTime(LEVELS[l], ctx.currentTime, 0.05);
}

export function louder(): Loudness {
  const next: Loudness = getLoudness() === 'softer' ? 'normal' : 'louder';
  setLoudness(next);
  return next;
}

export function softer(): Loudness {
  const next: Loudness = getLoudness() === 'louder' ? 'normal' : 'softer';
  setLoudness(next);
  return next;
}

// ---------- talk-over: go quiet, finish the sentence, listen ----------
/** She started talking: drop to a murmur within about a tenth of a second. */
export function duck() {
  if (duckGain && ctx) duckGain.gain.setTargetAtTime(DUCKED, ctx.currentTime, 0.04);
}

/** It was just an "mm-hm": carry on at her normal loudness. */
export function unduck() {
  if (duckGain && ctx) duckGain.gain.setTargetAtTime(1, ctx.currentTime, 0.12);
}

/** She has something to say: finish this sentence softly, then stop and listen. */
export function finishSentence() {
  if (current) current.finishAfterThis = true;
}

// ---------- who is speaking (for the orb, captions and the ears) ----------
export interface VoiceState {
  speaking: boolean;
  sentence: string | null;
}
const listeners = new Set<(s: VoiceState) => void>();
let state: VoiceState = { speaking: false, sentence: null };
function setState(s: VoiceState) {
  state = s;
  listeners.forEach((l) => l(s));
}
export function onVoice(cb: (s: VoiceState) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function isSpeaking(): boolean {
  return state.speaking;
}

// ---------- fetching and caching spoken sentences ----------
const clips = new Map<string, Promise<AudioBuffer | null>>();
let voiceDownUntil = 0;

function clip(text: string): Promise<AudioBuffer | null> {
  const hit = clips.get(text);
  if (hit) {
    clips.delete(text); // keep most-recent last
    clips.set(text, hit);
    return hit;
  }
  const p = (async () => {
    if (Date.now() < voiceDownUntil) return null;
    try {
      const res = await fetch('/api/house/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const bytes = await res.arrayBuffer();
      return await new Promise<AudioBuffer>((resolve, reject) => audioContext().decodeAudioData(bytes, resolve, reject));
    } catch {
      voiceDownUntil = Date.now() + 60_000; // use the iPad's voice for a minute, then try again
      clips.delete(text);
      return null;
    }
  })();
  clips.set(text, p);
  if (clips.size > 80) clips.delete(clips.keys().next().value as string);
  return p;
}

/** Fetch phrases ahead of time so they play instantly (greetings, "I didn't catch that"). */
export function warm(...texts: string[]) {
  texts.forEach((t) => sentences(t, true).done.forEach((s) => void clip(s)));
}

// ---------- splitting words into speakable sentences ----------
function sentences(buffer: string, final: boolean): { done: string[]; rest: string } {
  const done: string[] = [];
  const re = /[^.!?…]*[.!?…]+["'”’)]*(\s+|$)/y;
  let i = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(buffer)) && m[0].length) {
    // Without a following space the sentence may still be growing ("3." of "3.5").
    if (!final && !m[1]) break;
    done.push(m[0].trim());
    i = re.lastIndex;
  }
  let rest = buffer.slice(i);
  // A long run with no full stop yet: speak up to the last comma so she isn't kept waiting.
  if (!final && rest.length > 160) {
    const cut = rest.lastIndexOf(', ');
    if (cut > 60) {
      done.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 2);
    }
  }
  if (final && rest.trim()) {
    done.push(rest.trim());
    rest = '';
  }
  return { done: done.filter((s) => /\w/.test(s)), rest };
}

// ---------- one thing said: a reply, possibly still arriving ----------
export interface SpeechResult {
  /** What she actually heard, sentence by sentence. */
  spoken: string;
  /** True when she talked over it and it stopped early to listen. */
  interrupted: boolean;
}

class Utterance {
  finishAfterThis = false;
  private pending = '';
  private queue: { text: string; audio: Promise<AudioBuffer | null> }[] = [];
  private ended = false;
  private stopped = false;
  private wakeLoop: (() => void) | null = null;
  private source: AudioBufferSourceNode | null = null;
  private stopNow: (() => void) | null = null;
  readonly done: Promise<SpeechResult>;

  constructor() {
    this.done = this.run();
  }

  push(text: string) {
    if (this.ended) return;
    this.pending += text;
    this.take(false);
  }

  end() {
    if (this.ended) return;
    this.take(true);
    this.ended = true;
    this.wakeLoop?.();
  }

  stop() {
    this.stopped = true;
    this.queue = [];
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.stopNow?.();
    this.wakeLoop?.();
  }

  private take(final: boolean) {
    const { done, rest } = sentences(this.pending, final);
    this.pending = rest;
    for (const text of done) this.queue.push({ text, audio: clip(text) });
    if (done.length) this.wakeLoop?.();
  }

  private async run(): Promise<SpeechResult> {
    const spoken: string[] = [];
    let interrupted = false;
    if (duckGain && ctx) {
      duckGain.gain.cancelScheduledValues(ctx.currentTime);
      duckGain.gain.setValueAtTime(1, ctx.currentTime);
    }
    while (!this.stopped) {
      const next = this.queue.shift();
      if (!next) {
        if (this.ended) break;
        await new Promise<void>((r) => (this.wakeLoop = r));
        this.wakeLoop = null;
        continue;
      }
      const buffer = await next.audio;
      if (this.stopped) break;
      setState({ speaking: true, sentence: next.text });
      if (buffer) await this.play(buffer);
      else await this.deviceVoice(next.text);
      if (this.stopped) break;
      spoken.push(next.text);
      if (this.finishAfterThis && (this.queue.length || !this.ended || this.pending)) {
        interrupted = true;
        break;
      }
    }
    if (this.stopped) interrupted = true;
    if (current === this) {
      current = null;
      setState({ speaking: false, sentence: null });
    }
    return { spoken: spoken.join(' '), interrupted };
  }

  private play(buffer: AudioBuffer): Promise<void> {
    const c = audioContext();
    if (c.state !== 'running') c.resume().catch(() => {});
    return new Promise((resolve) => {
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.connect(duckGain!);
      this.source = src;
      // If the iPad has paused sound (a call, the lock screen), never wait forever.
      const guard = window.setTimeout(() => src.onended?.(new Event('ended')), (buffer.duration + 2) * 1000);
      const finish = () => {
        window.clearTimeout(guard);
        this.source = null;
        this.stopNow = null;
        resolve();
      };
      this.stopNow = finish;
      src.onended = finish;
      src.start();
    });
  }

  private deviceVoice(text: string): Promise<void> {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9; // unhurried
      u.volume = LEVELS[getLoudness()];
      const voices = window.speechSynthesis.getVoices();
      const en =
        voices.find((v) => /^en/.test(v.lang) && /female|samantha|karen|moira|serena/i.test(v.name)) ??
        voices.find((v) => v.lang.startsWith('en') && v.localService) ??
        voices.find((v) => v.lang.startsWith('en'));
      if (en) u.voice = en;
      this.stopNow = resolve;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }
}

let current: Utterance | null = null;
let recording: HTMLAudioElement | null = null;
let recordingDone: (() => void) | null = null;

export function stopAll(): void {
  current?.stop();
  current = null;
  if (recording) {
    recording.pause();
    recording = null;
  }
  const cb = recordingDone;
  recordingDone = null;
  cb?.();
  setState({ speaking: false, sentence: null });
}

/** Start speaking a reply that may still be arriving: push words, then end(). */
export function say(): Utterance {
  stopAll();
  current = new Utterance();
  return current;
}

/** Read words aloud in Storyhouse's own voice. Resolves when finished or stopped. */
export function speak(text: string): Promise<void> {
  const u = say();
  u.push(text);
  u.end();
  return u.done.then(() => {});
}

/** Play a family recording. Resolves when it finishes or is stopped. */
export function playRecording(url: string): Promise<void> {
  stopAll();
  return new Promise((resolve) => {
    const audio = new Audio(url);
    recording = audio;
    recordingDone = resolve;
    // Through Web Audio too, so Softer / Louder apply to family voices as well.
    try {
      const c = audioContext();
      c.createMediaElementSource(audio).connect(masterGain!);
    } catch {
      /* plays directly instead */
    }
    const done = () => {
      if (recording === audio) recording = null;
      recordingDone = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

// Her companion's ears. The microphone stays open while she's in a
// conversation, with the iPad's echo cancelling on, so it can hear her even
// while it is talking. A small voice detector decides when she has started
// and finished speaking:
//   • it adapts to the room (a TV, a fan) and, separately, to whatever is left
//     of the companion's own voice, so only HER voice counts;
//   • it keeps half a second from just before she started, so her first word
//     isn't clipped;
//   • it waits patiently (1.5 s of quiet) before deciding she's done, because
//     people pause mid-thought, and more so with memory loss;
//   • a cough or a single click is too short to count.
// Each finished utterance is handed over as a small 16 kHz WAV for Whisper.
// Nothing is recorded or kept outside a turn.

import { audioContext, isSpeaking } from './voice';

export interface EarsOptions {
  /** She began speaking (confirmed, not a click). */
  onStart?: () => void;
  /** She finished. `voicedMs` is how much of it was actually voice. */
  onUtterance: (wav: Blob, voicedMs: number) => void;
  /** It turned out to be too short to be words (a cough, a tap). */
  onDiscard?: () => void;
  /** 0..1, for the orb to breathe with her voice. */
  onLevel?: (level: number) => void;
  endSilenceMs?: number;
}

export interface Ears {
  /** Is she mid-utterance right now? */
  readonly hearing: boolean;
  /** Is there voice right now (the last quarter second)? */
  readonly voicing: boolean;
  /** Finish now: send what she has said so far (or nothing, if she hasn't spoken). */
  finish(): void;
  close(): void;
}

const PREROLL_MS = 500;
const MAX_UTTERANCE_MS = 60_000;
const MIN_VOICED_MS = 350;

const TAP_WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('sh-tap', Tap);`;
let workletReady: Promise<boolean> | null = null;

export async function openEars(opts: EarsOptions): Promise<Ears> {
  const ctx = audioContext();
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const source = ctx.createMediaStreamSource(stream);
  const sink = ctx.createGain();
  sink.gain.value = 0; // the mic must never come out of the speaker
  sink.connect(ctx.destination);

  const rate = ctx.sampleRate;
  const endSilence = opts.endSilenceMs ?? 1500;

  // ---- detector state ----
  let roomFloor = 0.004; // background level of the room
  let echoFloor = 0.01; // what's left of the companion's voice after echo cancelling
  const recent: boolean[] = []; // voiced / not, last ~20 frames
  const preroll: Float32Array[] = [];
  let prerollMs = 0;
  let utter: Float32Array[] | null = null;
  let utterMs = 0;
  let voicedMs = 0;
  let quietMs = 0;
  let level = 0;
  let closed = false;

  function frame(x: Float32Array) {
    if (closed) return;
    const ms = (x.length / rate) * 1000;
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
    const rms = Math.sqrt(sum / x.length);
    const talking = isSpeaking();

    const threshold = talking ? Math.max(echoFloor * 3, roomFloor * 4, 0.02) : Math.max(roomFloor * 3, 0.01);
    const voiced = rms > threshold;

    // Learn the room (and the echo) only while she isn't speaking.
    if (!utter) {
      if (talking) echoFloor += (rms - echoFloor) * (rms > echoFloor ? 0.02 : 0.05);
      else roomFloor += (rms - roomFloor) * (rms > roomFloor ? 0.01 : 0.05);
      roomFloor = Math.min(Math.max(roomFloor, 0.002), 0.05);
      echoFloor = Math.min(Math.max(echoFloor, 0.004), 0.08);
    }

    level += (Math.min(1, rms / (threshold * 3)) - level) * 0.3;
    opts.onLevel?.(level);

    recent.push(voiced);
    if (recent.length > 20) recent.shift();

    if (!utter) {
      preroll.push(x);
      prerollMs += ms;
      while (prerollMs > PREROLL_MS && preroll.length > 1) prerollMs -= (preroll.shift()!.length / rate) * 1000;
      // Onset: about a quarter second of voice within the last ~0.4 s (longer while
      // the companion is talking, so a passing sound doesn't make it hush).
      const need = talking ? 14 : 11;
      if (recent.filter(Boolean).length >= need) {
        utter = [...preroll];
        utterMs = prerollMs;
        voicedMs = need * ms;
        quietMs = 0;
        preroll.length = 0;
        prerollMs = 0;
        opts.onStart?.();
      }
      return;
    }

    utter.push(x);
    utterMs += ms;
    if (rms > threshold * 0.6) {
      quietMs = 0;
      if (voiced) voicedMs += ms;
    } else {
      quietMs += ms;
    }
    if (quietMs >= endSilence || utterMs >= MAX_UTTERANCE_MS) end();
  }

  function end() {
    if (!utter) return;
    const chunks = utter;
    const keepQuiet = Math.min(quietMs, 300);
    const dropMs = quietMs - keepQuiet;
    utter = null;
    recent.length = 0;
    if (voicedMs < MIN_VOICED_MS) {
      opts.onDiscard?.();
      return;
    }
    opts.onUtterance(toWav(chunks, rate, dropMs), voicedMs);
  }

  // ---- wire the microphone to the detector ----
  let node: AudioNode;
  workletReady ??= ctx.audioWorklet
    ? ctx.audioWorklet
        .addModule(URL.createObjectURL(new Blob([TAP_WORKLET], { type: 'application/javascript' })))
        .then(() => true)
        .catch(() => false)
    : Promise.resolve(false);
  if (await workletReady) {
    const w = new AudioWorkletNode(ctx, 'sh-tap');
    w.port.onmessage = (e) => frame(e.data as Float32Array);
    node = w;
  } else {
    // Older iPads: the deprecated but universal ScriptProcessor.
    const sp = ctx.createScriptProcessor(1024, 1, 1);
    sp.onaudioprocess = (e) => frame(new Float32Array(e.inputBuffer.getChannelData(0)));
    node = sp;
  }
  source.connect(node);
  node.connect(sink);

  return {
    get hearing() {
      return !!utter;
    },
    get voicing() {
      return recent.slice(-12).filter(Boolean).length >= 6;
    },
    finish() {
      if (utter) {
        quietMs = 0;
        end();
      }
    },
    close() {
      closed = true;
      utter = null;
      try {
        source.disconnect();
        node.disconnect();
        sink.disconnect();
      } catch {
        /* already gone */
      }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/** Float frames at the iPad's rate → 16 kHz 16-bit mono WAV (what Whisper likes, and small). */
function toWav(chunks: Float32Array[], rate: number, dropTailMs: number): Blob {
  let total = chunks.reduce((n, c) => n + c.length, 0);
  total = Math.max(0, total - Math.floor((dropTailMs / 1000) * rate));
  const ratio = rate / 16000;
  const outLen = Math.floor(total / ratio);
  const pcm = new Int16Array(outLen);
  // Walk the chunks once, averaging each 16 kHz sample's window (a simple low-pass).
  let ci = 0;
  let off = 0;
  let pos = 0;
  for (let o = 0; o < outLen; o++) {
    const end = Math.floor((o + 1) * ratio);
    let acc = 0;
    let n = 0;
    while (pos < end && ci < chunks.length) {
      acc += chunks[ci][off];
      n++;
      pos++;
      if (++off >= chunks[ci].length) {
        ci++;
        off = 0;
      }
    }
    const s = n ? acc / n : 0;
    pcm[o] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
  }
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.byteLength, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm.buffer], { type: 'audio/wav' });
}

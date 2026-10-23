// Storyhouse's speaking voice: natural speech from Deepgram Aura on Workers AI
// (in the family's own Cloudflare account). Every sentence is cached in R2 by
// its exact words + voice, so phrases she hears often are instant and free.
// If the model is unavailable, the iPad falls back to its own built-in voice.

import { env } from '../config.js';
import { first, run, nowIso } from '../db.js';

export const VOICE_MODELS = {
  'aura-2': '@cf/deepgram/aura-2-en',
  'aura-1': '@cf/deepgram/aura-1',
} as const;
export type VoiceModel = keyof typeof VOICE_MODELS;

export interface VoiceSetting {
  model: VoiceModel;
  speaker: string;
}

export const DEFAULT_VOICE: VoiceSetting = { model: 'aura-2', speaker: 'luna' };

export async function getVoice(): Promise<VoiceSetting> {
  const r = await first<{ value: string }>(`SELECT value FROM settings WHERE key = 'voice'`);
  try {
    const v = r ? (JSON.parse(r.value) as VoiceSetting) : DEFAULT_VOICE;
    return VOICE_MODELS[v.model] && /^[a-z]+$/.test(v.speaker) ? v : DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

export async function setVoice(v: VoiceSetting): Promise<void> {
  await run(
    `INSERT INTO settings (key, value) VALUES ('voice', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    JSON.stringify(v),
  );
  await run(
    `INSERT INTO settings (key, value) VALUES ('voice_updated', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    nowIso(),
  );
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Clean text so it reads naturally out loud (no markdown or emoji). */
export function speakable(text: string): string {
  return text
    .replace(/[*_#`>~]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

/** MP3 bytes for one sentence or short passage, from cache when possible. */
export async function synthesize(text: string, voice?: VoiceSetting): Promise<{ bytes: ArrayBuffer; cached: boolean }> {
  const v = voice ?? (await getVoice());
  const clean = speakable(text);
  if (!clean) throw new Error('nothing to say');
  const key = `tts/${await sha256(`${v.model}|${v.speaker}|${clean}`)}.mp3`;

  const hit = await env.MEDIA.get(key);
  if (hit) return { bytes: await hit.arrayBuffer(), cached: true };

  const out = (await env.AI.run(VOICE_MODELS[v.model] as any, { text: clean, speaker: v.speaker, encoding: 'mp3' } as any)) as unknown;
  // The binding returns a stream of MP3 bytes; normalize whatever comes back to an ArrayBuffer.
  const bytes: ArrayBuffer =
    out instanceof ArrayBuffer ? out : await new Response(out as BodyInit).arrayBuffer();
  if (!bytes.byteLength) throw new Error('no audio');
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'audio/mpeg' } });
  return { bytes, cached: false };
}

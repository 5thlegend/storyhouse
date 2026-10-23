import { env } from '../config.js';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Her spoken words → text, with open Whisper on Workers AI. Returns '' if nothing was heard. */
export async function transcribe(audio: ArrayBuffer): Promise<string> {
  const out = (await env.AI.run('@cf/openai/whisper-large-v3-turbo' as any, {
    audio: toBase64(new Uint8Array(audio)),
    language: 'en',
    vad_filter: true,
  } as any)) as { text?: string };
  return out?.text?.trim() ?? '';
}

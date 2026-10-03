import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Repo root is two levels up from server/src
const repoRoot = path.resolve(__dirname, '..', '..');

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  databasePath: path.resolve(
    repoRoot,
    process.env.DATABASE_PATH ?? './data/storyhouse.db',
  ),

  // Open-source AI core
  aiProvider: (process.env.AI_PROVIDER ?? 'ollama') as 'ollama' | 'mock',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  aiModel: process.env.AI_MODEL ?? 'gemma3:4b',
  embedModel: process.env.EMBED_MODEL ?? 'nomic-embed-text',

  // Optional voice/image adapters
  elevenLabsKey: process.env.ELEVENLABS_API_KEY ?? '',
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? '',
  imageProvider: (process.env.IMAGE_PROVIDER ?? 'mock') as 'mock' | 'external',
  imageApiKey: process.env.IMAGE_API_KEY ?? '',

  // Demo mode — the public deployment MUST run in demo mode.
  demoMode: bool(process.env.DEMO_MODE, true),
} as const;

export type AppConfig = typeof config;

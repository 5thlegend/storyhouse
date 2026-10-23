import { env as rawEnv } from 'cloudflare:workers';

// Bindings + vars come from wrangler.jsonc (typed by `wrangler types`).
// Secrets are set with `wrangler secret put` and never live in the repo.
export interface Secrets {
  STUDIO_PASSCODE?: string;
  FAMILY_PASSCODE?: string;
  SESSION_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
}
export type AppEnv = Env & Secrets;

export const env = rawEnv as unknown as AppEnv;

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export function config() {
  return {
    // The AI core. anthropic = Claude (with Gemma 4 as the automatic fallback);
    // workers-ai = Gemma 4 on the family's own Cloudflare account; ollama = Gemma 3
    // on a local machine; mock = honest offline mode.
    aiProvider: (env.AI_PROVIDER || 'workers-ai') as 'anthropic' | 'workers-ai' | 'ollama' | 'mock',
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    aiModel: env.AI_MODEL || '@cf/google/gemma-4-26b-a4b-it',
    embedModel: env.EMBED_MODEL || '@cf/google/embeddinggemma-300m',
    imageModel: env.IMAGE_MODEL || '@cf/black-forest-labs/flux-2-klein-4b',
    ollamaBaseUrl: env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: env.OLLAMA_MODEL || 'gemma3:4b',
    ollamaEmbedModel: env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',

    // Demo mode seeds fictional "Margaret" data. Never on with real family data.
    demoMode: bool(env.DEMO_MODE, false),

    // Access. With no STUDIO_PASSCODE set, nobody can get in — fail closed.
    studioPasscode: env.STUDIO_PASSCODE ?? '',
    familyPasscode: env.FAMILY_PASSCODE ?? '',
    sessionSecret: env.SESSION_SECRET ?? '',
  };
}

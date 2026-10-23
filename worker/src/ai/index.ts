import { config } from '../config.js';
import type { AIProvider } from './types.js';
import { WorkersAIProvider } from './workersai.js';
import { OllamaProvider } from './ollama.js';
import { MockProvider } from './mock.js';
import { ClaudeProvider } from './claude.js';
import { FallbackProvider } from './fallback.js';

export type { AIProvider, RetrievedContext } from './types.js';

const workersAi = new WorkersAIProvider();
const ollama = new OllamaProvider();
const mock = new MockProvider();
const claude = new ClaudeProvider();

export interface ProviderStatus {
  active: string;
  openModelOnline: boolean;
  configuredProvider: string;
  model: string;
}

/**
 * Returns the configured provider when it's reachable, otherwise falls back
 * honestly: Claude → Gemma 4 on Workers AI → the offline mock. The app never
 * shows her an error just because one model is down.
 */
export async function getProvider(): Promise<{ provider: AIProvider; status: ProviderStatus }> {
  const cfg = config();

  if (cfg.aiProvider === 'anthropic' && (await claude.isAvailable())) {
    // A fresh wrapper per request, so it can report which model really answered.
    const provider = new FallbackProvider(claude, workersAi);
    return {
      provider,
      status: {
        active: provider.name,
        openModelOnline: true,
        configuredProvider: 'anthropic',
        model: cfg.anthropicModel,
      },
    };
  }

  // Without an Anthropic key, "anthropic" quietly runs on Gemma 4 instead.
  const chosen: AIProvider | null =
    cfg.aiProvider === 'workers-ai' || cfg.aiProvider === 'anthropic'
      ? workersAi
      : cfg.aiProvider === 'ollama'
        ? ollama
        : null;
  const model = cfg.aiProvider === 'ollama' ? cfg.ollamaModel : cfg.aiModel;

  const online = chosen ? await chosen.isAvailable() : false;
  const provider = online && chosen ? chosen : mock;
  return {
    provider,
    status: {
      active: provider.name,
      openModelOnline: online,
      configuredProvider: cfg.aiProvider,
      model,
    },
  };
}

import { config } from '../config.js';
import type { AIProvider } from './types.js';
import { WorkersAIProvider } from './workersai.js';
import { OllamaProvider } from './ollama.js';
import { MockProvider } from './mock.js';

export type { AIProvider, RetrievedContext } from './types.js';

const workersAi = new WorkersAIProvider();
const ollama = new OllamaProvider();
const mock = new MockProvider();

export interface ProviderStatus {
  active: string;
  openModelOnline: boolean;
  configuredProvider: string;
  model: string;
}

/**
 * Returns the configured open-weight provider when it's reachable, otherwise
 * transparently falls back to the honest offline provider. The core intelligence
 * is always an open model when available — closed providers are never the core.
 */
export async function getProvider(): Promise<{ provider: AIProvider; status: ProviderStatus }> {
  const cfg = config();
  const chosen: AIProvider | null =
    cfg.aiProvider === 'workers-ai' ? workersAi : cfg.aiProvider === 'ollama' ? ollama : null;
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

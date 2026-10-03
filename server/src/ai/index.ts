import { config } from '../config.js';
import type { AIProvider } from './types.js';
import { OllamaProvider } from './ollama.js';
import { MockProvider } from './mock.js';

export type { AIProvider, RetrievedContext } from './types.js';

const ollama = new OllamaProvider();
const mock = new MockProvider();

export interface ProviderStatus {
  active: string;
  openModelOnline: boolean;
  configuredProvider: string;
  model: string;
}

/**
 * Returns the configured open-source provider when it's reachable, otherwise
 * transparently falls back to the honest offline provider. The core intelligence
 * is always the open model when available — closed providers are never the core.
 */
export async function getProvider(): Promise<{ provider: AIProvider; status: ProviderStatus }> {
  if (config.aiProvider === 'mock') {
    return {
      provider: mock,
      status: {
        active: mock.name,
        openModelOnline: false,
        configuredProvider: 'mock',
        model: config.aiModel,
      },
    };
  }

  const online = await ollama.isAvailable();
  const provider = online ? ollama : mock;
  return {
    provider,
    status: {
      active: provider.name,
      openModelOnline: online,
      configuredProvider: config.aiProvider,
      model: config.aiModel,
    },
  };
}

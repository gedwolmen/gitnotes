/**
 * Provider Factory Registry
 *
 * Central registry for all AI provider types in GitNotes.
 * When adding a new provider, follow these steps:
 *
 * 1. Add the type string to `AIProviderType` in `src/models/AIProvider.ts`
 * 2. Add a factory entry to `FACTORIES` in this file
 * 3. Add default models to `src/stores/aiStore.ts` in `createDefaultProviders()`
 * 4. Update the settings UI tap handler in `src/screens/SettingsScreen.tsx`
 * 5. Write tests in `__tests__/ai/` covering build, availability, and limits
 */

import type { LanguageModel } from 'ai';
import type { AIModelConfig, AIProviderConfig, AIProviderType } from '../../models/AIProvider';
import type { ModelContextLimit } from './modelLimits';
import { isAnthropicBaseURL } from './anthropicDefaults';
import axios from 'axios';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { buildQuirkedFetch } from './providerQuirks';

export interface ConnectionTestResult {
  models: AIModelConfig[];
  message: string;
}

export interface ProviderFactory {
  requiresBaseURL: boolean;
  requiresApiKey: boolean;
  defaultBaseURL?: string;
  build: (config: AIProviderConfig) => Promise<unknown>;
  testConnection: (
    baseURL: string,
    apiKey: string,
    providerId: string,
  ) => Promise<ConnectionTestResult>;
  contextLimit?: ModelContextLimit;
}

async function testOpenAIConnection(
  baseURL: string,
  apiKey: string,
  providerId: string,
): Promise<ConnectionTestResult> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  const url = baseURL.endsWith('/') ? `${baseURL}models` : `${baseURL}/models`;
  const response = await axios.get(url, { headers, timeout: 10000 });
  const modelsData = response.data?.data || response.data;

  if (!Array.isArray(modelsData)) {
    throw new Error('Unexpected response format. Expected an array of models.');
  }

  const models: AIModelConfig[] = modelsData.map((m: { id?: string; name?: string }) => ({
    id: String(m.id || m.name),
    name: String(m.name || m.id),
    providerId,
    providerType: 'openai-compatible' as const,
    requiresDownload: false,
  }));

  return { models, message: `Discovered ${models.length} models.` };
}

async function testAnthropicConnection(
  baseURL: string,
  apiKey: string,
  providerId: string,
): Promise<ConnectionTestResult> {
  const url = isAnthropicBaseURL(baseURL)
    ? 'https://api.anthropic.com/v1/models'
    : `${baseURL.replace(/\/$/, '')}/models`;

  const response = await axios.get(url, {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    timeout: 10000,
  });
  const modelsData = response.data?.data || response.data;

  if (!Array.isArray(modelsData)) {
    throw new Error('Unexpected response format from Anthropic API.');
  }

  const models: AIModelConfig[] = modelsData.map((m: { id?: string; display_name?: string }) => ({
    id: String(m.id),
    name: String(m.display_name || m.id),
    providerId,
    providerType: 'anthropic' as const,
    requiresDownload: false,
  }));

  return { models, message: `Connected to Anthropic and discovered ${models.length} models.` };
}

const APPLE_LIMIT: ModelContextLimit = {
  totalTokens: 4096,
  reservedTokens: 1500,
  label: 'Apple on-device (4K total)',
};

const LLAMA_DEFAULT_LIMIT: ModelContextLimit = {
  totalTokens: 8192,
  reservedTokens: 2000,
  label: 'on-device Llama (~8K)',
};

const CLAUDE_LIMIT: ModelContextLimit = {
  totalTokens: 200000,
  reservedTokens: 10000,
  label: 'Claude (200K total)',
};

export const FACTORIES: Record<AIProviderType, ProviderFactory> = {
  apple: {
    requiresBaseURL: false,
    requiresApiKey: false,
    build: async () => {
      const { apple } = await import('@react-native-ai/apple');
      return apple;
    },
    testConnection: async () => ({ models: [], message: 'On-device Apple Intelligence provider.' }),
    contextLimit: APPLE_LIMIT,
  },
  llama: {
    requiresBaseURL: false,
    requiresApiKey: false,
    build: async () => {
      const { llama } = await import('@react-native-ai/llama');
      return llama;
    },
    testConnection: async () => ({ models: [], message: 'On-device Llama provider.' }),
    contextLimit: LLAMA_DEFAULT_LIMIT,
  },
  'openai-compatible': {
    requiresBaseURL: true,
    requiresApiKey: true,
    build: async (config) => {
      const quirkedFetch = buildQuirkedFetch(config.baseURL!);

      return createOpenAICompatible({
        name: config.id,
        baseURL: config.baseURL!,
        apiKey: config.apiKey!,
        ...(quirkedFetch ? { fetch: quirkedFetch } : {}),
      });
    },
    testConnection: testOpenAIConnection,
  },
  anthropic: {
    requiresBaseURL: false,
    requiresApiKey: true,
    defaultBaseURL: 'https://api.anthropic.com/v1',
    build: async (config) => {
      return createAnthropic({
        apiKey: config.apiKey!,
        ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      });
    },
    testConnection: testAnthropicConnection,
    contextLimit: CLAUDE_LIMIT,
  },
};

export function getFactory(type: AIProviderType): ProviderFactory {
  return FACTORIES[type];
}

export function validateNetworkProviderFields(
  config: AIProviderConfig,
  factory: ProviderFactory,
): void {
  if (factory.requiresApiKey && !config.apiKey) {
    throw new Error(`Provider "${config.name}" is missing an API key`);
  }
  if (factory.requiresBaseURL && !config.baseURL) {
    throw new Error(`Provider "${config.name}" is missing a base URL`);
  }
}

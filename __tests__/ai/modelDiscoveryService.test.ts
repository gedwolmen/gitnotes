import { discoverModelsIfNeeded, clearCachedModels, clearAllCachedModels } from '../../src/services/ai/modelDiscoveryService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFactory } from '../../src/services/ai/providerFactory';
import { ANTHROPIC_DEFAULT_MODELS } from '../../src/services/ai/anthropicDefaults';
import type { AIProviderConfig } from '../../src/models/AIProvider';

jest.mock('@react-native-async-storage/async-storage');
jest.mock('../../src/services/ai/providerFactory');

const mockGetFactory = getFactory as jest.MockedFunction<typeof getFactory>;

describe('modelDiscoveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock) = jest.fn(async () => null);
    (AsyncStorage.setItem as jest.Mock) = jest.fn(async () => undefined);
    (AsyncStorage.removeItem as jest.Mock) = jest.fn(async () => undefined);
    (AsyncStorage.getAllKeys as jest.Mock) = jest.fn(async () => []);
    (AsyncStorage.multiRemove as jest.Mock) = jest.fn(async () => undefined);
  });

  const baseAnthropicProvider: AIProviderConfig = {
    id: 'anthropic-default',
    type: 'anthropic',
    name: 'Anthropic',
    apiKey: 'sk-ant-test',
    isEnabled: true,
    models: [],
    addedAt: Date.now(),
  };

  test('returns existing models for non-anthropic providers', async () => {
    const nonAnthropic: AIProviderConfig = {
      id: 'openai-provider',
      type: 'openai-compatible',
      name: 'OpenAI',
      apiKey: 'sk-test',
      isEnabled: true,
      models: [{ id: 'gpt-4', name: 'GPT-4', providerId: 'openai-provider', providerType: 'openai-compatible', requiresDownload: false }],
      addedAt: Date.now(),
    };

    const result = await discoverModelsIfNeeded(nonAnthropic);
    expect(result).toEqual(nonAnthropic.models);
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(mockGetFactory).not.toHaveBeenCalled();
  });

  test('returns default models when anthropic provider has no API key', async () => {
    const noKeyProvider: AIProviderConfig = {
      ...baseAnthropicProvider,
      apiKey: undefined,
    };

    const result = await discoverModelsIfNeeded(noKeyProvider);
    
    expect(result).toHaveLength(ANTHROPIC_DEFAULT_MODELS.length);
    expect(result[0].providerType).toBe('anthropic');
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  test('returns cached models if available and fresh', async () => {
    const cachedModels = [
      { id: 'claude-4', name: 'Claude 4', providerId: 'anthropic-default', providerType: 'anthropic', requiresDownload: false },
    ];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({
      models: cachedModels,
      timestamp: Date.now(),
      sdkVersion: '4.0.38',
    }));

    const result = await discoverModelsIfNeeded(baseAnthropicProvider);
    
    expect(result).toEqual(cachedModels);
    expect(mockGetFactory).not.toHaveBeenCalled();
  });

  test('discovers new models when cache is stale', async () => {
    const twentyFiveHoursAgo = Date.now() - (25 * 60 * 60 * 1000);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({
      models: [],
      timestamp: twentyFiveHoursAgo,
      sdkVersion: '4.0.38',
    }));

    const discoveredModels = [
      { id: 'claude-new', name: 'Claude New', providerId: 'anthropic-default', providerType: 'anthropic', requiresDownload: false },
    ];
    mockGetFactory.mockReturnValue({
      testConnection: jest.fn().mockResolvedValue({
        models: discoveredModels,
        message: 'Discovered 1 models',
      }),
      build: jest.fn(),
      requiresBaseURL: false,
      requiresApiKey: true,
    } as any);

    const result = await discoverModelsIfNeeded(baseAnthropicProvider);
    
    expect(result).toEqual(discoveredModels);
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  test('falls back to defaults when discovery fails', async () => {
    mockGetFactory.mockReturnValue({
      testConnection: jest.fn().mockRejectedValue(new Error('Network error')),
      build: jest.fn(),
      requiresBaseURL: false,
      requiresApiKey: true,
    } as any);

    const result = await discoverModelsIfNeeded(baseAnthropicProvider);
    
    expect(result).toHaveLength(ANTHROPIC_DEFAULT_MODELS.length);
    expect(result[0].providerType).toBe('anthropic');
  });

  test('clearCachedModels removes specific provider cache', async () => {
    await clearCachedModels('anthropic-default');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('anthropic-models-cache-anthropic-default');
  });

  test('clearAllCachedModels removes all anthropic caches', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([
      'anthropic-models-cache-provider-1',
      'anthropic-models-cache-provider-2',
      'other-cache',
    ]);

    await clearAllCachedModels();
    
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      'anthropic-models-cache-provider-1',
      'anthropic-models-cache-provider-2',
    ]);
  });
});

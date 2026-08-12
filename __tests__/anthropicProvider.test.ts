import { getModelContextLimit } from '../src/services/ai/modelLimits';
import { resolveProviderAvailability } from '../src/services/ai/providerAvailability';
import { initializeModel } from '../src/services/AIService';

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(({ apiKey }: { apiKey: string }) => ({
    chatModel: (modelId: string) => ({
      modelId,
      provider: 'anthropic',
      doGenerate: jest.fn(),
      doStream: jest.fn(),
    }),
  })),
}));

jest.mock('../src/services/ai/providerQuirks', () => ({
  buildQuirkedFetch: jest.fn(() => undefined),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

describe('Anthropic Provider', () => {
  describe('getModelContextLimit', () => {
    it('returns 200K limit for anthropic provider type', () => {
      const result = getModelContextLimit({
        providerType: 'anthropic',
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        providerId: 'test',
        requiresDownload: false,
      });
      expect(result).not.toBeNull();
      expect(result!.totalTokens).toBe(200000);
      expect(result!.reservedTokens).toBe(10000);
      expect(result!.label).toBe('Claude (200K total)');
    });

    it('returns null for openai-compatible provider type (no generic limit)', () => {
      const result = getModelContextLimit({
        providerType: 'openai-compatible',
        id: 'some-model',
        name: 'Some Model',
        providerId: 'test',
        requiresDownload: false,
      });
      expect(result).toBeNull();
    });
  });

  describe('resolveProviderAvailability', () => {
    it('returns available for anthropic provider', async () => {
      const result = await resolveProviderAvailability({
        type: 'anthropic',
        name: 'Anthropic',
        id: 'anthropic-default',
        isEnabled: true,
        addedAt: 0,
        apiKey: 'test-key-123',
        baseURL: 'https://api.anthropic.com/v1',
        models: [],
      });
      expect(result.kind).toBe('available');
    });

    it('returns available for anthropic without explicit baseURL (uses default)', async () => {
      const result = await resolveProviderAvailability({
        type: 'anthropic',
        name: 'Anthropic',
        id: 'anthropic-default',
        isEnabled: true,
        addedAt: 0,
        apiKey: 'test-key-123',
        models: [],
      });
      expect(result.kind).toBe('available');
    });
  });

  describe('initializeModel', () => {
    it('initializes anthropic model via createAnthropic', async () => {
      const model = await initializeModel(
        {
          providerType: 'anthropic',
          id: 'claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4',
          providerId: 'anthropic-default',
          requiresDownload: false,
        },
        {
          type: 'anthropic',
          name: 'Anthropic',
          id: 'anthropic-default',
          isEnabled: true,
          addedAt: 0,
          apiKey: 'sk-ant-test-key',
          models: [],
        },
      );

      expect(model).toBeDefined();
      expect((model as any).modelId).toBe('claude-sonnet-4-20250514');
    });

    it('initializes anthropic model with optional baseURL', async () => {
      const model = await initializeModel(
        {
          providerType: 'anthropic',
          id: 'claude-haiku-3-5-20241022',
          name: 'Claude Haiku 3.5',
          providerId: 'anthropic-default',
          requiresDownload: false,
        },
        {
          type: 'anthropic',
          name: 'Anthropic (Proxy)',
          id: 'anthropic-proxy',
          isEnabled: true,
          addedAt: 0,
          apiKey: 'sk-ant-proxy-key',
          baseURL: 'https://my-proxy.example.com/v1',
          models: [],
        },
      );

      expect(model).toBeDefined();
      expect((model as any).modelId).toBe('claude-haiku-3-5-20241022');
    });

    it('throws when anthropic provider has no apiKey', async () => {
      await expect(
        initializeModel(
          {
            providerType: 'anthropic',
            id: 'claude-sonnet-4-20250514',
            name: 'Claude Sonnet 4',
            providerId: 'anthropic-default',
            requiresDownload: false,
          },
          {
            type: 'anthropic',
            name: 'Anthropic',
            id: 'anthropic-default',
            isEnabled: true,
            addedAt: 0,
            models: [],
          },
        ),
      ).rejects.toThrow(/missing an API key/i);
    });
  });
});

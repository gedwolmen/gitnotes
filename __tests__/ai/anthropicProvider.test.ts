import { resolveProviderAvailability } from '../../src/services/ai/providerAvailability';
import type { AIProviderConfig } from '../../src/models/AIProvider';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../../src/services/AIService', () => ({
  buildProviderInstance: jest.fn(),
}));

const anthropicProvider: AIProviderConfig = {
  id: 'anthropic-default',
  type: 'anthropic',
  name: 'Anthropic',
  apiKey: 'sk-ant-test-key',
  isEnabled: true,
  addedAt: Date.now(),
  models: [
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      providerId: 'anthropic-default',
      providerType: 'anthropic',
      requiresDownload: false,
    },
  ],
};

describe('Anthropic Provider Integration', () => {
  describe('resolveProviderAvailability', () => {
    test('Anthropic providers are always available (network-based)', async () => {
      const result = await resolveProviderAvailability(anthropicProvider);
      expect(result.kind).toBe('available');
    });

    test('Anthropic provider without baseURL is still available', async () => {
      const providerWithoutURL: AIProviderConfig = {
        ...anthropicProvider,
        baseURL: undefined,
      };
      const result = await resolveProviderAvailability(providerWithoutURL);
      expect(result.kind).toBe('available');
    });
  });
});

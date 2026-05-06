/* eslint-disable @typescript-eslint/no-require-imports */
import type { AIProviderConfig } from '../../src/models/AIProvider';

const mockState: {
  os: 'ios' | 'android';
  appleAvailable: boolean;
  appleThrows: boolean;
  modelId: string | null;
} = {
  os: 'ios',
  appleAvailable: false,
  appleThrows: false,
  modelId: null,
};

jest.mock('react-native', () => ({
  get Platform() {
    return { OS: mockState.os, select: (m: Record<string, unknown>) => m[mockState.os] };
  },
}));

jest.mock('@react-native-ai/apple', () => ({
  AppleFoundationModels: {
    isAvailable: () => {
      if (mockState.appleThrows) throw new Error('native bridge unavailable');
      return mockState.appleAvailable;
    },
  },
}));

jest.mock('expo-device', () => ({
  get modelId() {
    return mockState.modelId;
  },
}));

const baseProvider = (overrides: Partial<AIProviderConfig>): AIProviderConfig => ({
  id: 'apple-default',
  type: 'apple',
  name: 'Apple Intelligence',
  isEnabled: true,
  models: [],
  addedAt: 0,
  supportedPlatforms: ['ios'],
  ...overrides,
});

function setMocks(opts: Partial<typeof mockState>) {
  Object.assign(mockState, opts);
}

describe('resolveProviderAvailability', () => {
  beforeEach(() => {
    Object.assign(mockState, {
      os: 'ios',
      appleAvailable: false,
      appleThrows: false,
      modelId: null,
    });
    jest.resetModules();
  });

  test('marks ios-only provider as platform-mismatch on android', async () => {
    setMocks({ os: 'android' });
    const { resolveProviderAvailability } = require('../../src/services/ai/providerAvailability');
    const result = await resolveProviderAvailability(baseProvider({ id: 'apple-platform-mismatch' }));
    expect(result.kind).toBe('unavailable');
    expect(result.reason.code).toBe('platform-mismatch');
    expect(result.reason.supportedPlatforms).toEqual(['ios']);
  });

  test('marks A16-or-older iPhone as device-ineligible when native says unavailable', async () => {
    setMocks({ os: 'ios', appleAvailable: false, modelId: 'iPhone15,3' }); // iPhone 14 Pro Max
    const { resolveProviderAvailability } = require('../../src/services/ai/providerAvailability');
    const result = await resolveProviderAvailability(baseProvider({ id: 'apple-iphone14' }));
    expect(result.kind).toBe('unavailable');
    expect(result.reason.code).toBe('device-ineligible');
    expect(result.reason.message).toMatch(/iPhone 15 Pro/);
  });

  test('treats iPhone 15 Pro (iPhone16,1) as eligible when native reports available', async () => {
    setMocks({ os: 'ios', appleAvailable: true, modelId: 'iPhone16,1' });
    const { resolveProviderAvailability } = require('../../src/services/ai/providerAvailability');
    const result = await resolveProviderAvailability(baseProvider({ id: 'apple-iphone15pro' }));
    expect(result.kind).toBe('available');
  });

  test('eligible device but Apple Intelligence not active reports apple-intelligence-disabled', async () => {
    setMocks({ os: 'ios', appleAvailable: false, modelId: 'iPhone17,3' }); // iPhone 16 family
    const { resolveProviderAvailability } = require('../../src/services/ai/providerAvailability');
    const result = await resolveProviderAvailability(baseProvider({ id: 'apple-iphone16-disabled' }));
    expect(result.kind).toBe('unavailable');
    expect(result.reason.code).toBe('apple-intelligence-disabled');
  });

  test('classifies non-Pro iPhone 15 (iPhone15,4) as device-ineligible', async () => {
    setMocks({ os: 'ios', appleAvailable: false, modelId: 'iPhone15,4' });
    const { resolveProviderAvailability } = require('../../src/services/ai/providerAvailability');
    const result = await resolveProviderAvailability(baseProvider({ id: 'apple-iphone15-base' }));
    expect(result.kind).toBe('unavailable');
    expect(result.reason.code).toBe('device-ineligible');
  });

  test('non-apple provider always available regardless of platform', async () => {
    setMocks({ os: 'android' });
    const { resolveProviderAvailability } = require('../../src/services/ai/providerAvailability');
    const result = await resolveProviderAvailability({
      id: 'openai-default',
      type: 'openai-compatible',
      name: 'OpenAI',
      isEnabled: true,
      models: [],
      addedAt: 0,
    });
    expect(result.kind).toBe('available');
  });

  test('caches result for identical provider id within TTL', async () => {
    setMocks({ os: 'ios', appleAvailable: true, modelId: 'iPhone16,1' });
    const { resolveProviderAvailability } = require('../../src/services/ai/providerAvailability');
    const provider = baseProvider({ id: 'apple-cache-hit' });
    const first = await resolveProviderAvailability(provider);
    const second = await resolveProviderAvailability(provider);
    expect(first).toBe(second);
  });
});

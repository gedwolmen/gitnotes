import { describe, beforeEach, expect, it } from '@jest/globals';
import {
  VisionCapabilityChecker,
  type VisionCheckResult,
} from '../../src/services/canvas/VisionCapabilityChecker';
import type { AIModelConfig, AIProviderConfig } from '../../src/models/AIProvider';

/** Helper to build a minimal AIModelConfig for testing. */
function makeModel(
  overrides: Partial<AIModelConfig> = {},
): AIModelConfig {
  return {
    id: 'model-1',
    name: 'Test Model',
    providerId: 'provider-1',
    providerType: 'openai-compatible',
    requiresDownload: false,
    ...overrides,
  };
}

/** Helper to build a minimal AIProviderConfig for testing. */
function makeProvider(
  overrides: Partial<AIProviderConfig> = {},
): AIProviderConfig {
  return {
    id: 'provider-1',
    type: 'openai-compatible',
    name: 'Test Provider',
    baseURL: 'https://api.example.com',
    apiKey: 'test-key',
    isEnabled: true,
    models: [],
    addedAt: 0,
    ...overrides,
  };
}

describe('VisionCapabilityChecker', () => {
  let checker: VisionCapabilityChecker;

  beforeEach(() => {
    checker = new VisionCapabilityChecker();
  });

  describe('check()', () => {
    it('llama provider: always returns false (never kind)', () => {
      const model = makeModel();
      const provider = makeProvider({ type: 'llama' });
      const result = checker.check(model, provider);
      expect(result.supported).toBe(false);
      expect(result.supportKind).toBe('never');
      expect(result.reason).toContain('llama');
    });

    it('anthropic provider: all models return true (always kind)', () => {
      const model = makeModel({ id: 'claude-3-haiku', name: 'Claude 3 Haiku' });
      const provider = makeProvider({ type: 'anthropic', name: 'Anthropic' });
      const result = checker.check(model, provider);
      expect(result.supported).toBe(true);
      expect(result.supportKind).toBe('always');
      expect(result.reason).toContain('Anthropic');
    });

    it('openai-compatible with explicit supportsVision=true returns true', () => {
      const model = makeModel({
        id: 'gpt-4o',
        name: 'GPT-4o',
        supportsVision: true,
      });
      const provider = makeProvider({ type: 'openai-compatible' });
      const result = checker.check(model, provider);
      expect(result.supported).toBe(true);
      expect(result.supportKind).toBe('always');
    });

    it('openai-compatible with ID containing "vision" returns true', () => {
      const model = makeModel({ id: 'some-model-vision-preview' });
      const provider = makeProvider({ type: 'openai-compatible' });
      const result = checker.check(model, provider);
      expect(result.supported).toBe(true);
      expect(result.supportKind).toBe('when-declared');
    });

    it('openai-compatible with ID containing "gpt-4o" returns true (heuristic)', () => {
      const model = makeModel({ id: 'gpt-4o-mini' });
      const provider = makeProvider({ type: 'openai-compatible' });
      const result = checker.check(model, provider);
      expect(result.supported).toBe(true);
    });

    it('openai-compatible with ID containing "qwen-vl" returns true', () => {
      const model = makeModel({ id: 'qwen-vl-max' });
      const provider = makeProvider({ type: 'openai-compatible' });
      const result = checker.check(model, provider);
      expect(result.supported).toBe(true);
    });

    it('openai-compatible without vision indicators returns false', () => {
      const model = makeModel({ id: 'gpt-3.5-turbo', name: 'GPT-3.5' });
      const provider = makeProvider({ type: 'openai-compatible' });
      const result = checker.check(model, provider);
      expect(result.supported).toBe(false);
      expect(result.supportKind).toBe('when-declared');
      expect(result.reason).toContain('supportsVision');
    });

    it('apple provider with "apple-foundation" ID returns true (iOS 18.1+)', () => {
      const model = makeModel({ id: 'apple-foundation', name: 'Foundation' });
      const provider = makeProvider({ type: 'apple' });
      const result = checker.check(model, provider);
      expect(result.supported).toBe(true);
    });

    it('apple provider with other ID returns false', () => {
      const model = makeModel({ id: 'apple-other', name: 'Other' });
      const provider = makeProvider({ type: 'apple' });
      const result = checker.check(model, provider);
      expect(result.supported).toBe(false);
    });
  });

  describe('findVisionModel()', () => {
    const anthropicProvider = makeProvider({
      id: 'anthropic-1',
      type: 'anthropic',
      name: 'Anthropic',
      models: [
        makeModel({ id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', providerId: 'anthropic-1' }),
      ],
    });

    const openaiProviderWithVision = makeProvider({
      id: 'openai-1',
      type: 'openai-compatible',
      name: 'OpenAI-Compat',
      models: [
        makeModel({
          id: 'gpt-4o',
          name: 'GPT-4o',
          providerId: 'openai-1',
          supportsVision: true,
        }),
      ],
    });

    const openaiProviderNoVision = makeProvider({
      id: 'openai-2',
      type: 'openai-compatible',
      name: 'Text Only',
      models: [
        makeModel({
          id: 'gpt-3.5-turbo',
          name: 'GPT-3.5',
          providerId: 'openai-2',
        }),
      ],
    });

    const llamaProvider = makeProvider({
      id: 'llama-1',
      type: 'llama',
      name: 'On-Device',
      models: [
        makeModel({
          id: 'llama-3-8b',
          name: 'Llama 3',
          providerId: 'llama-1',
          providerType: 'llama',
        }),
      ],
    });

    it('returns selected model when it supports vision', () => {
      const result = checker.findVisionModel(
        [openaiProviderWithVision],
        'gpt-4o',
      );
      expect(result).not.toBeNull();
      expect(result!.model.id).toBe('gpt-4o');
    });

    it('falls back to Anthropic when selected model lacks vision', () => {
      const result = checker.findVisionModel(
        [anthropicProvider, openaiProviderNoVision],
        'gpt-3.5-turbo', // selected but no vision
      );
      expect(result).not.toBeNull();
      expect(result!.provider.type).toBe('anthropic');
    });

    it('falls back to openai-compatible with supportsVision when no Anthropic', () => {
      const result = checker.findVisionModel(
        [openaiProviderWithVision, llamaProvider],
        null,
      );
      expect(result).not.toBeNull();
      expect(result!.model.id).toBe('gpt-4o');
    });

    it('returns null if no vision model exists', () => {
      const result = checker.findVisionModel(
        [llamaProvider, openaiProviderNoVision],
        null,
      );
      expect(result).toBeNull();
    });

    it('skips disabled providers', () => {
      const disabledAnthropic = makeProvider({
        id: 'anthropic-disabled',
        type: 'anthropic',
        isEnabled: false,
        models: [
          makeModel({
            id: 'claude-3-opus',
            name: 'Claude 3 Opus',
            providerId: 'anthropic-disabled',
          }),
        ],
      });
      const result = checker.findVisionModel([disabledAnthropic], null);
      expect(result).toBeNull();
    });

    it('returns null when providers list is empty', () => {
      const result = checker.findVisionModel([], null);
      expect(result).toBeNull();
    });
  });
});

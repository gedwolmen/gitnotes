import {
  checkContextBudget,
  estimateTokensFromBytes,
  getModelContextLimit,
} from '../../src/services/ai/modelLimits';
import type { AIModelConfig } from '../../src/models/AIProvider';

const apple: AIModelConfig = {
  id: 'apple-foundation',
  name: 'Apple',
  providerId: 'apple-default',
  providerType: 'apple',
  requiresDownload: false,
};

const llamaSmol: AIModelConfig = {
  id: 'llama-smol',
  name: 'SmolLM3 3B',
  providerId: 'llama-default',
  providerType: 'llama',
  requiresDownload: true,
};

const llamaDefault: AIModelConfig = {
  id: 'llama-other',
  name: 'OtherLlama',
  providerId: 'llama-default',
  providerType: 'llama',
  requiresDownload: true,
};

const openai: AIModelConfig = {
  id: 'gpt-4',
  name: 'GPT-4',
  providerId: 'p',
  providerType: 'openai-compatible',
  requiresDownload: false,
};

describe('estimateTokensFromBytes', () => {
  test('uses 4 bytes-per-token heuristic and rounds up', () => {
    expect(estimateTokensFromBytes(0)).toBe(0);
    expect(estimateTokensFromBytes(1)).toBe(1);
    expect(estimateTokensFromBytes(4)).toBe(1);
    expect(estimateTokensFromBytes(5)).toBe(2);
    expect(estimateTokensFromBytes(4000)).toBe(1000);
  });
});

describe('getModelContextLimit', () => {
  test('apple uses 4K limit', () => {
    expect(getModelContextLimit(apple)?.totalTokens).toBe(4096);
  });

  test('SmolLM3 detected by id or name (case-insensitive)', () => {
    expect(getModelContextLimit(llamaSmol)?.totalTokens).toBe(65536);
    expect(
      getModelContextLimit({ ...llamaSmol, id: 'x', name: 'Smol-Whatever' })?.totalTokens,
    ).toBe(65536);
  });

  test('default llama gets 8K', () => {
    expect(getModelContextLimit(llamaDefault)?.totalTokens).toBe(8192);
  });

  test('openai-compatible has no enforced limit (returns null)', () => {
    expect(getModelContextLimit(openai)).toBeNull();
  });
});

describe('checkContextBudget', () => {
  test('returns no-warn when model is undefined', () => {
    const result = checkContextBudget(undefined, 1024 * 1024);
    expect(result.warningLevel).toBe('none');
    expect(result.message).toBeNull();
    expect(result.overBudget).toBe(false);
  });

  test('returns no-warn for unlimited models', () => {
    const result = checkContextBudget(openai, 1024 * 1024);
    expect(result.warningLevel).toBe('none');
    expect(result.message).toBeNull();
  });

  test('no warning when below 60% of budget', () => {
    // apple budget = 4096 - 1500 = 2596 tokens; 60% = 1557 tokens = 6228 bytes
    const result = checkContextBudget(apple, 100);
    expect(result.warningLevel).toBe('none');
    expect(result.overBudget).toBe(false);
  });

  test('caution between 60% of budget and budget', () => {
    // budget = 2596; 80% ≈ 2076 tokens ≈ 8304 bytes
    const result = checkContextBudget(apple, 8304);
    expect(result.warningLevel).toBe('caution');
    expect(result.overBudget).toBe(false);
    expect(result.message).toMatch(/close to/);
  });

  test('over budget returns warning level "over"', () => {
    // budget = 2596 tokens; 4000 tokens → 16000 bytes
    const result = checkContextBudget(apple, 16000);
    expect(result.warningLevel).toBe('over');
    expect(result.overBudget).toBe(true);
    expect(result.message).toMatch(/exceeds/);
  });
});

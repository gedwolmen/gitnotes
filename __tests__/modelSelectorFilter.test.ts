import { filterProviders } from '../src/components/ai/modelSelectorFilter';
import type { AIProviderConfig } from '../src/models/AIProvider';

const makeProvider = (
  id: string,
  name: string,
  modelNames: string[],
): AIProviderConfig => ({
  id,
  type: 'openai-compatible',
  name,
  isEnabled: true,
  addedAt: 0,
  models: modelNames.map((mName, idx) => ({
    id: `${id}-${idx}`,
    name: mName,
    providerId: id,
    providerType: 'openai-compatible',
    requiresDownload: false,
  })),
});

const providers: AIProviderConfig[] = [
  makeProvider('openai', 'OpenAI', ['gpt-4o', 'gpt-4o-mini', 'o1-preview']),
  makeProvider('openrouter', 'OpenRouter', ['anthropic/claude-3.5-sonnet', 'meta/llama-3.1-70b']),
  makeProvider('apple', 'Apple Intelligence', []),
];

describe('filterProviders', () => {
  test('empty query returns providers unchanged', () => {
    expect(filterProviders(providers, '')).toEqual(providers);
  });

  test('whitespace-only query returns providers unchanged', () => {
    expect(filterProviders(providers, '   ')).toEqual(providers);
  });

  test('case-insensitive model-name match', () => {
    const result = filterProviders(providers, 'GPT');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('openai');
    expect(result[0].models.map((m) => m.name)).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  test('provider-name match returns provider with all its models', () => {
    const result = filterProviders(providers, 'openrouter');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('openrouter');
    expect(result[0].models).toHaveLength(2);
  });

  test('partial model-name match within a provider returns only matching models', () => {
    const result = filterProviders(providers, 'mini');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('openai');
    expect(result[0].models.map((m) => m.name)).toEqual(['gpt-4o-mini']);
  });

  test('no match returns empty array', () => {
    expect(filterProviders(providers, 'xyzzy-no-match')).toEqual([]);
  });

  test('provider with empty models array included only on provider-name match', () => {
    const onName = filterProviders(providers, 'apple');
    expect(onName).toHaveLength(1);
    expect(onName[0].id).toBe('apple');

    const offName = filterProviders(providers, 'gpt');
    expect(offName.find((p) => p.id === 'apple')).toBeUndefined();
  });
});

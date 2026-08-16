import { describe, beforeEach, expect, it, jest } from '@jest/globals';

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('../../src/services/AIService', () => ({
  initializeModel: jest.fn(),
}));

import { generateText } from 'ai';
import { initializeModel } from '../../src/services/AIService';
import { proposeMerge } from '../../src/services/conflict/AiConflictResolver';
import type { FileConflict } from '../../src/services/conflict/types';
import type { AIModelConfig, AIProviderConfig } from '../../src/models/AIProvider';

const mockGenerateText = jest.mocked(generateText);
const mockInitializeModel = jest.mocked(initializeModel);

// Minimal stub for LanguageModel (satisfies type, never used as instance by mock)
const STUB_MODEL = { modelId: 'test-model' } as any;

const modelConfig: AIModelConfig = {
  id: 'test-model',
  name: 'Test Model',
  providerId: 'test-provider',
  providerType: 'anthropic',
  requiresDownload: false,
};

const providerConfig: AIProviderConfig = {
  id: 'test-provider',
  type: 'anthropic',
  name: 'Test Provider',
  apiKey: 'sk-test',
  isEnabled: true,
  models: [modelConfig],
  addedAt: 0,
};

function makeConflict(overrides: Partial<FileConflict> = {}): FileConflict {
  return {
    path: 'notes/hello.md',
    kind: 'both-changed-different',
    format: 'text',
    localContent: '# Hello\n\nLocal change',
    remoteContent: '# Hello\n\nRemote change',
    baseContent: '# Hello',
    mergedContent: null,
    localSha: 'abc123',
    remoteSha: 'def456',
    autoResolved: false,
    ...overrides,
  };
}

describe('AiConflictResolver.proposeMerge', () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
    mockInitializeModel.mockReset();
    mockInitializeModel.mockResolvedValue(STUB_MODEL);
  });

  it('returns merged markdown with high confidence on text conflict', async () => {
    const merged = '# Hello\n\nMerged content';
    mockGenerateText.mockResolvedValue({ text: merged } as any);

    const result = await proposeMerge(makeConflict(), modelConfig, providerConfig);

    expect(result.confidence).toBe('high');
    expect(result.mergedContent).toBe(merged);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const call = mockGenerateText.mock.calls[0][0];
    expect(call.system).toContain('Output ONLY the merged file content');
    expect(call.prompt).toContain('<<<<<<< LOCAL');
    expect(call.prompt).toContain('=======');
    expect(call.prompt).toContain('>>>>>>> REMOTE');
    expect(call.prompt).toContain('BASE CONTENT:');
    expect(call.prompt).toContain('# Hello\n\nLocal change');
    expect(call.prompt).toContain('# Hello\n\nRemote change');
  });

  it('returns merged JSON with high confidence on json conflict', async () => {
    const merged = '{"a": 1, "b": 2, "remote_only": 3}';
    mockGenerateText.mockResolvedValue({ text: merged } as any);

    const result = await proposeMerge(
      makeConflict({
        format: 'json',
        baseContent: '{"a": 1}',
        localContent: '{"a": 1, "b": 2}',
        remoteContent: '{"a": 1, "b": 3}',
      }),
      modelConfig,
      providerConfig,
    );

    expect(result.confidence).toBe('high');
    expect(result.mergedContent).toBe(merged);
    const call = mockGenerateText.mock.calls[0][0];
    expect(call.system).toContain('valid JSON');
  });

  it('returns null with low confidence for binary conflicts', async () => {
    const result = await proposeMerge(makeConflict({ format: 'binary' }), modelConfig, providerConfig);

    expect(result.mergedContent).toBeNull();
    expect(result.confidence).toBe('low');
    expect(result.note).toContain('Not enough context');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('returns null with low confidence when 3-way content is missing', async () => {
    const result = await proposeMerge(makeConflict({ baseContent: null }), modelConfig, providerConfig);

    expect(result.mergedContent).toBeNull();
    expect(result.confidence).toBe('low');
    expect(result.note).toContain('Not enough context');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('returns null with low confidence when generateText throws', async () => {
    mockGenerateText.mockRejectedValue(new Error('Model unavailable'));

    const result = await proposeMerge(makeConflict(), modelConfig, providerConfig);

    expect(result.mergedContent).toBeNull();
    expect(result.confidence).toBe('low');
    expect(result.note).toBe('Model unavailable');
  });

  it('returns null with low confidence when initializeModel throws', async () => {
    mockInitializeModel.mockRejectedValue(new Error('Failed to initialize model "Test Model": no key'));

    const result = await proposeMerge(makeConflict(), modelConfig, providerConfig);

    expect(result.mergedContent).toBeNull();
    expect(result.confidence).toBe('low');
    expect(result.note).toContain('Failed to initialize');
  });

  it('rejects empty output as null with low confidence', async () => {
    mockGenerateText.mockResolvedValue({ text: '   \n  ' } as any);

    const result = await proposeMerge(makeConflict(), modelConfig, providerConfig);

    expect(result.mergedContent).toBeNull();
    expect(result.confidence).toBe('low');
    expect(result.note).toBe('AI returned no usable merge');
  });

  it('rejects output identical to local content', async () => {
    const localContent = '# Hello\n\nLocal change';
    mockGenerateText.mockResolvedValue({ text: localContent } as any);

    const result = await proposeMerge(makeConflict({ localContent }), modelConfig, providerConfig);

    expect(result.mergedContent).toBeNull();
    expect(result.confidence).toBe('low');
    expect(result.note).toBe('AI returned no usable merge');
  });

  it('returns null with low confidence when no model is configured', async () => {
    const result = await proposeMerge(makeConflict());

    expect(result.mergedContent).toBeNull();
    expect(result.confidence).toBe('low');
    expect(result.note).toBe('No AI model configured');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});

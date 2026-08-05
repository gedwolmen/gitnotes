jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (value: string) => value }),
}));

jest.mock('../src/services/AIService', () => ({
  initializeModel: jest.fn(async () => ({})),
  streamChatResponse: jest.fn(),
}));

jest.mock('../src/services/ContextService', () => ({
  buildContextString: jest.fn(async () => ''),
}));

jest.mock('../src/services/ChatStorageService', () => ({
  loadThreadSummaries: jest.fn(async () => []),
  loadThread: jest.fn(async () => null),
  saveThread: jest.fn(async () => undefined),
  deleteThread: jest.fn(async () => true),
  setChatRepoAccount: jest.fn(),
}));

jest.mock('../src/services/ai/systemPrompt', () => ({
  buildSystemPrompt: jest.fn((ctx: { memoryBlock?: string }) => {
    let prompt = 'system prompt';
    if (ctx.memoryBlock) {
      prompt += `\n\n=== User memory (thought dumps) ===\n${ctx.memoryBlock}\n=== End memory ===`;
    }
    return prompt;
  }),
}));

jest.mock('../src/services/ai/modelLimits', () => ({
  checkContextBudget: jest.fn(() => ({ warningLevel: 'none', message: '' })),
  getModelContextLimit: jest.fn(() => ({
    totalTokens: 8192,
    reservedTokens: 2000,
    label: 'test-model',
  })),
  estimateTokensFromBytes: jest.fn((bytes: number) => Math.ceil(bytes / 4)),
}));

jest.mock('../src/services/ai/actionExecutor', () => ({
  executeToolCall: jest.fn(async () => ({ success: true, requiresConfirmation: false })),
}));

jest.mock('../src/services/ai/tools', () => ({
  chatTools: {
    create_note: { description: 'Create a note' },
  },
}));

jest.mock('../src/services/ai/AIMemoryIndexService', () => {
  const search = jest.fn(async () => []);
  const getEntryCount = jest.fn(() => 0);
  return {
    aiMemoryIndex: { search, getEntryCount },
    AIMemoryIndexService: jest.fn(() => ({ search, getEntryCount })),
  };
});

import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as AIService from '../src/services/AIService';
import { buildSystemPrompt } from '../src/services/ai/systemPrompt';
import { aiMemoryIndex } from '../src/services/ai/AIMemoryIndexService';
import { useChatScreenController } from '../src/components/chat/useChatScreenController';
import { useAIStore } from '../src/stores/aiStore';
import { useChatStore } from '../src/stores/chatStore';
import { useNoteStore } from '../src/stores/noteStore';
import { useTodoStore } from '../src/stores/todoStore';

describe('useChatScreenController - memory injection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupDefaultStore = () => {
    const emptyStream = (async function* () {}) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(emptyStream);

    useNoteStore.setState({ notes: [] } as any);
    useTodoStore.setState({ todos: [] } as any);
    useAIStore.setState({
      isEnabled: true,
      selectedModelId: 'model-1',
      actionMode: 'auto',
      chatRepoOwner: 'owner',
      chatRepoName: 'repo',
      chatRepoBranch: 'main',
      chatRepoAccountId: null,
      providers: [{
        id: 'provider-1',
        type: 'openai-compatible',
        name: 'Provider',
        isEnabled: true,
        addedAt: 0,
        models: [{
          id: 'model-1',
          name: 'Model 1',
          providerId: 'provider-1',
          providerType: 'openai-compatible',
          requiresDownload: false,
        }],
      }],
      isLoading: false,
      error: null,
    } as any);

    useChatStore.setState({
      threads: [{ id: 'thread-1', title: 'New Chat', updatedAt: 1, messageCount: 0 }],
      activeThread: {
        id: 'thread-1',
        title: 'New Chat',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        repoOwner: 'owner',
        repoName: 'repo',
        branch: 'main',
        filePath: 'chat/thread-1.json',
      },
      isLoading: false,
      error: null,
      isStreaming: false,
      storageAdapter: null,
    } as any);
  };

  test('injects memory block when search returns results', async () => {
    setupDefaultStore();

    (aiMemoryIndex.getEntryCount as jest.Mock).mockReturnValue(3);
    (aiMemoryIndex.search as jest.Mock).mockResolvedValue([
      {
        filePath: 'thoughts/20250115-120000-abc12345.md',
        snippet: 'User loves hiking in the mountains',
        score: 0.85,
      },
      {
        filePath: 'thoughts/20250220-090000-def67890.md',
        snippet: 'Planning a trip to Japan',
        score: 0.72,
      },
    ]);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    await act(async () => {
      result.current.handleSend('What should I do this weekend?');
      await jest.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(jest.mocked(buildSystemPrompt)).toHaveBeenCalled();
    });

    const lastCall = jest.mocked(buildSystemPrompt).mock.calls.at(-1)?.[0];
    expect(lastCall?.memoryBlock).toBeDefined();
    expect(lastCall?.memoryBlock).toContain('[2025-01-15]');
    expect(lastCall?.memoryBlock).toContain('User loves hiking in the mountains');
    expect(lastCall?.memoryBlock).toContain('[2025-02-20]');
    expect(lastCall?.memoryBlock).toContain('Planning a trip to Japan');
  });

  test('does not inject memory block when index is empty', async () => {
    setupDefaultStore();

    (aiMemoryIndex.getEntryCount as jest.Mock).mockReturnValue(0);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    await act(async () => {
      result.current.handleSend('Hello world');
      await jest.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(jest.mocked(buildSystemPrompt)).toHaveBeenCalled();
    });

    const lastCall = jest.mocked(buildSystemPrompt).mock.calls.at(-1)?.[0];
    expect(lastCall?.memoryBlock).toBeUndefined();
  });

  test('does not inject memory block for tool-action-shaped queries', async () => {
    setupDefaultStore();

    (aiMemoryIndex.getEntryCount as jest.Mock).mockReturnValue(5);
    (aiMemoryIndex.search as jest.Mock).mockResolvedValue([
      { filePath: 'thoughts/20250115-120000-abc.md', snippet: 'test', score: 0.9 },
    ]);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    await act(async () => {
      result.current.handleSend('Create a note about hiking');
      await jest.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(jest.mocked(buildSystemPrompt)).toHaveBeenCalled();
    });

    const lastCall = jest.mocked(buildSystemPrompt).mock.calls.at(-1)?.[0];
    expect(lastCall?.memoryBlock).toBeUndefined();
    expect(aiMemoryIndex.search).not.toHaveBeenCalled();
  });

  test('proceeds without memory block when search fails', async () => {
    setupDefaultStore();

    (aiMemoryIndex.getEntryCount as jest.Mock).mockReturnValue(3);
    (aiMemoryIndex.search as jest.Mock).mockRejectedValue(new Error('Index corrupted'));

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    await act(async () => {
      result.current.handleSend('Tell me about my thoughts');
      await jest.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(jest.mocked(buildSystemPrompt)).toHaveBeenCalled();
    });

    const lastCall = jest.mocked(buildSystemPrompt).mock.calls.at(-1)?.[0];
    expect(lastCall?.memoryBlock).toBeUndefined();
  });

  test('truncates memory block when oversized (drops lowest-score chunks)', async () => {
    setupDefaultStore();

    (aiMemoryIndex.getEntryCount as jest.Mock).mockReturnValue(5);
    (aiMemoryIndex.search as jest.Mock).mockResolvedValue([
      { filePath: 'thoughts/20250101-000000-a.md', snippet: 'A'.repeat(1200), score: 0.9 },
      { filePath: 'thoughts/20250102-000000-b.md', snippet: 'B'.repeat(1200), score: 0.7 },
      { filePath: 'thoughts/20250103-000000-c.md', snippet: 'C'.repeat(1200), score: 0.5 },
      { filePath: 'thoughts/20250104-000000-d.md', snippet: 'D'.repeat(1200), score: 0.3 },
      { filePath: 'thoughts/20250105-000000-e.md', snippet: 'E'.repeat(1200), score: 0.1 },
    ]);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    await act(async () => {
      result.current.handleSend('What are my thoughts?');
      await jest.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(jest.mocked(buildSystemPrompt)).toHaveBeenCalled();
    });

    const lastCall = jest.mocked(buildSystemPrompt).mock.calls.at(-1)?.[0];
    if (lastCall?.memoryBlock) {
      const lines = lastCall.memoryBlock.split('\n');
      expect(lines.length).toBeLessThan(5);
      expect(lastCall.memoryBlock).toContain('A'.repeat(500));
      expect(lastCall.memoryBlock).not.toContain('E'.repeat(500));
    }
  });

  test('does not invoke notes tools for memory injection', async () => {
    setupDefaultStore();

    (aiMemoryIndex.getEntryCount as jest.Mock).mockReturnValue(2);
    (aiMemoryIndex.search as jest.Mock).mockResolvedValue([
      { filePath: 'thoughts/20250115-120000-abc.md', snippet: 'test memory', score: 0.8 },
    ]);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    await act(async () => {
      result.current.handleSend('What do I know?');
      await jest.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(jest.mocked(buildSystemPrompt)).toHaveBeenCalled();
    });

    const lastCall = jest.mocked(buildSystemPrompt).mock.calls.at(-1)?.[0];
    expect(lastCall?.memoryBlock).toBeDefined();
    expect(lastCall?.memoryBlock).toContain('test memory');
  });
});

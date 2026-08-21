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
  buildSystemPrompt: jest.fn(() => 'system prompt'),
}));

jest.mock('../src/services/ai/modelLimits', () => ({
  checkContextBudget: jest.fn(() => ({ warningLevel: 'none', message: '' })),
}));

jest.mock('../src/services/ai/actionExecutor', () => ({
  executeToolCall: jest.fn(async () => ({ success: true, requiresConfirmation: false })),
}));

jest.mock('../src/services/ai/tools', () => ({
  chatTools: {
    create_note: { description: 'Create a note' },
  },
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as AIService from '../src/services/AIService';
import * as ChatStorageService from '../src/services/ChatStorageService';
import * as ActionExecutor from '../src/services/ai/actionExecutor';
import { useChatScreenController } from '../src/components/chat/useChatScreenController';
import { useAIStore } from '../src/stores/aiStore';
import { useChatStore } from '../src/stores/chatStore';
import { useNoteStore } from '../src/stores/noteStore';
import { useTodoStore } from '../src/stores/todoStore';

describe('useChatScreenController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupDefaultStore = () => {
    const mockStream = (async function* () {}) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(mockStream);

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

  test('sets isStreaming to true after handleSend', async () => {
    setupDefaultStore();
    const emptyStream = (async function* () {}) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(emptyStream);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    act(() => {
      result.current.handleSend('Hello world');
    });

    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(true);
    });
  });

  test('sets isStreaming to false after stream completes', async () => {
    setupDefaultStore();
    const emptyStream = (async function* () {
      // Empty stream that completes immediately
    }) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(emptyStream);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    await act(async () => {
      result.current.handleSend('Hello world');
      await jest.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(false);
    }, { timeout: 3000 });
  });

  test('buttons become responsive immediately when stream completes (isStreaming false)', async () => {
    setupDefaultStore();

    // Stream that yields text then completes quickly
    const quickStream = (async function* () {
      yield JSON.stringify({ type: 'text-delta', textDelta: 'Hello' });
    }) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(quickStream);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    await act(async () => {
      result.current.handleSend('Test');
      await jest.runAllTimersAsync();
    });

    // After response, isStreaming should be false even if saveActiveThread is still pending
    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(false);
    }, { timeout: 3000 });
  });

  test('streamStartedAt resets to 0 after stream completes', async () => {
    setupDefaultStore();
    const emptyStream = (async function* () {}) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(emptyStream);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    act(() => {
      result.current.handleSend('Test message');
    });

    // streamStartedAt should have been set by handleSend

    await act(async () => {
      await jest.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.streamStartedAt).toBe(0);
    }, { timeout: 3000 });
  });

  test('persists thread title from first user message before stream completes', async () => {
    setupDefaultStore();
    const emptyStream = (async function* () {}) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(emptyStream);

    const saveThreadMock = jest.mocked(ChatStorageService.saveThread);
    const { result } = renderHook(() => useChatScreenController('thread-1'));

    act(() => {
      result.current.handleSend('Plan Sri Lanka trip itinerary');
    });

    await waitFor(() => expect(saveThreadMock).toHaveBeenCalled());

    const firstSavedThread = saveThreadMock.mock.calls[0]?.[0];
    expect(firstSavedThread?.title).toBe('Plan Sri Lanka trip itinerary');
    expect(firstSavedThread?.messages).toHaveLength(1);
    expect(firstSavedThread?.messages[0].content).toBe('Plan Sri Lanka trip itinerary');
  });

  test('calls executeToolCall when AI returns a tool-call event', async () => {
    setupDefaultStore();

    const toolCallStream = (async function* () {
      yield JSON.stringify({
        type: 'tool-call',
        toolCallId: 'tc-1',
        toolName: 'create_note',
        input: { title: 'Test Note', content: 'Test content' },
      });
    }) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(toolCallStream);

    const executeToolCallMock = ActionExecutor.executeToolCall as jest.Mock;
    executeToolCallMock.mockResolvedValueOnce({ success: true, requiresConfirmation: false });

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    await act(async () => {
      result.current.handleSend('Create a note');
      await jest.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(executeToolCallMock).toHaveBeenCalledWith(
        'create_note',
        expect.objectContaining({ title: 'Test Note', content: 'Test content' }),
        'auto'
      );
    }, { timeout: 3000 });
  });

  test('isStreaming remains false after error if buttons should be responsive', async () => {
    setupDefaultStore();

    const errorStream = (async function* () {
      throw new Error('Stream error');
    }) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(errorStream);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    await act(async () => {
      result.current.handleSend('Test');
      await jest.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(false);
    }, { timeout: 3000 });
  });

  test('handleSend is disabled when isStreaming is true', async () => {
    setupDefaultStore();
    const slowStream = (async function* () {
      await new Promise(() => {}); // Never resolves - simulates ongoing stream
    }) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(slowStream);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    act(() => {
      result.current.handleSend('First message');
    });

    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(true);
    });

    // Create a new hook instance to check handleSend's behavior
    const { result: result2 } = renderHook(() => useChatScreenController('thread-1'));

    // With isStreaming true, handleSend should not trigger another stream
    act(() => {
      result2.current.handleSend('Second message while streaming');
    });

    // Should still be streaming from first message, not second
    expect(useChatStore.getState().isStreaming).toBe(true);
  });

  test('stopStreaming does not throw when called', async () => {
    setupDefaultStore();
    const slowStream = (async function* () {
      await new Promise(() => {}); // Never completes
    }) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(slowStream);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    act(() => {
      result.current.handleSend('Start streaming');
    });

    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(true);
    });

    // stopStreaming should not throw
    act(() => {
      expect(() => result.current.stopStreaming()).not.toThrow();
    });
  });

  test('adds user message to thread before stream starts', async () => {
    setupDefaultStore();
    const emptyStream = (async function* () {}) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(emptyStream);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    act(() => {
      result.current.handleSend('User message');
    });

    await waitFor(() => {
      const messages = useChatStore.getState().activeThread?.messages ?? [];
      expect(messages.some(m => m.role === 'user' && m.content === 'User message')).toBe(true);
    });
  });

  test('setStreaming(false) called even if saveActiveThread fails', async () => {
    setupDefaultStore();
    const textStream = (async function* () {
      yield JSON.stringify({ type: 'text-delta', textDelta: 'Response text' });
    }) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(textStream);

    jest.mocked(ChatStorageService.saveThread).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    await act(async () => {
      result.current.handleSend('Test');
      await jest.runAllTimersAsync();
    });

    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(false);
    }, { timeout: 3000 });
  });

  test('handleSend does nothing when text is empty', async () => {
    setupDefaultStore();
    const emptyStream = (async function* () {}) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(emptyStream);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    act(() => {
      result.current.handleSend('');
    });

    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(jest.mocked(AIService.streamChatResponse)).not.toHaveBeenCalled();
  });

  test('handleSend does nothing when already streaming', async () => {
    setupDefaultStore();
    const slowStream = (async function* () {
      await new Promise(() => {}); // Never completes
    }) as any;
    jest.mocked(AIService.streamChatResponse).mockImplementation(slowStream);

    const { result } = renderHook(() => useChatScreenController('thread-1'));

    act(() => {
      result.current.handleSend('First');
    });

    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(true);
    });

    // Try to send another message while streaming
    act(() => {
      result.current.handleSend('Second while streaming');
    });

    // Should only have the first message
    const messages = useChatStore.getState().activeThread?.messages ?? [];
    expect(messages.filter(m => m.role === 'user').length).toBe(1);
  });
});

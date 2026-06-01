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
  chatTools: {},
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as AIService from '../src/services/AIService';
import * as ChatStorageService from '../src/services/ChatStorageService';
import { useChatScreenController } from '../src/components/chat/useChatScreenController';
import { useAIStore } from '../src/stores/aiStore';
import { useChatStore } from '../src/stores/chatStore';
import { useNoteStore } from '../src/stores/noteStore';
import { useTodoStore } from '../src/stores/todoStore';

describe('useChatScreenController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  test('persists derived title and first user message before stream completes', async () => {
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
});

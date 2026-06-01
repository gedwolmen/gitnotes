import { useChatStore } from '../src/stores/chatStore';
import { ChatMessage } from '../src/models/Chat';

const mockStorageAdapter = {
  loadThreadSummaries: jest.fn().mockResolvedValue([]),
  loadThread: jest.fn().mockResolvedValue(null),
  saveThread: jest.fn().mockResolvedValue(undefined),
  deleteThread: jest.fn().mockResolvedValue(undefined),
};

const mockMessage: ChatMessage = {
  id: 'msg-1',
  role: 'user',
  content: 'Hello AI',
  timestamp: Date.now(),
};

const mockAssistantMessage: ChatMessage = {
  id: 'msg-2',
  role: 'assistant',
  content: 'Hello! How can I help you today?',
  timestamp: Date.now(),
};

describe('ChatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      threads: [],
      activeThread: null,
      isLoading: false,
      error: null,
      isStreaming: false,
      storageAdapter: mockStorageAdapter,
    });
  });

  describe('loadThreads', () => {
    it('loads threads from storage adapter', async () => {
      const mockThreads = [
        { id: 't1', title: 'Thread 1', updatedAt: Date.now(), messageCount: 2 },
        { id: 't2', title: 'Thread 2', updatedAt: Date.now() - 1000, messageCount: 5 },
      ];
      mockStorageAdapter.loadThreadSummaries.mockResolvedValue(mockThreads);

      await useChatStore.getState().loadThreads({
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
      });

      const state = useChatStore.getState();
      expect(state.threads).toHaveLength(2);
      expect(state.threads[0].id).toBe('t1');
    });

    it('sets loading state during fetch', async () => {
      mockStorageAdapter.loadThreadSummaries.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 50))
      );

      const loadPromise = useChatStore.getState().loadThreads({
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
      });

      expect(useChatStore.getState().isLoading).toBe(true);

      await loadPromise;
      expect(useChatStore.getState().isLoading).toBe(false);
    });

    it('handles errors gracefully', async () => {
      mockStorageAdapter.loadThreadSummaries.mockRejectedValue(new Error('Network error'));

      await useChatStore.getState().loadThreads({
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
      });

      const state = useChatStore.getState();
      expect(state.error).toBe('Failed to load chat threads');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('createThread', () => {
    it('creates a new thread with correct properties', () => {
      const thread = useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      expect(thread.id).toMatch(/^\d+-[a-z0-9]+$/);
      expect(thread.title).toBe('New Chat');
      expect(thread.messages).toEqual([]);
      expect(thread.repoOwner).toBe('test-owner');
      expect(thread.repoName).toBe('test-repo');
      expect(thread.branch).toBe('main');
    });

    it('uses custom title when provided', () => {
      const thread = useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
        title: 'Custom Title',
      });

      expect(thread.title).toBe('Custom Title');
    });

    it('sets new thread as active thread', () => {
      const thread = useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      expect(useChatStore.getState().activeThread?.id).toBe(thread.id);
    });

    it('adds thread to threads list', () => {
      const thread = useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      expect(useChatStore.getState().threads).toHaveLength(1);
      expect(useChatStore.getState().threads[0].id).toBe(thread.id);
    });
  });

  describe('addMessage', () => {
    it('adds message to active thread', () => {
      useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      useChatStore.getState().addMessage(mockMessage);

      expect(useChatStore.getState().activeThread?.messages).toHaveLength(1);
      expect(useChatStore.getState().activeThread?.messages[0].id).toBe('msg-1');
    });

    it('auto-titles placeholder thread from first user message', () => {
      useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      useChatStore.getState().addMessage({
        ...mockMessage,
        content: 'Create note about Sri Lanka travel plan',
      });

      expect(useChatStore.getState().activeThread?.title).toBe('Create note about Sri Lanka travel plan');
      expect(useChatStore.getState().threads[0].title).toBe('Create note about Sri Lanka travel plan');
    });

    it('derives preview from latest meaningful message instead of placeholder text', () => {
      useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      useChatStore.getState().addMessage({
        ...mockMessage,
        content: 'Write outline for iOS onboarding test plan',
      });
      useChatStore.getState().addMessage({
        ...mockAssistantMessage,
        id: 'tool-1',
        content: '',
        toolCallName: 'create_note',
      });

      expect(useChatStore.getState().threads[0].preview).toBe('Create note');
    });

    it('does nothing when no active thread', () => {
      useChatStore.setState({ activeThread: null });

      useChatStore.getState().addMessage(mockMessage);

      expect(useChatStore.getState().threads).toHaveLength(0);
    });
  });

  describe('updateMessage', () => {
    it('updates existing message', () => {
      const thread = useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      useChatStore.getState().addMessage(mockMessage);
      useChatStore.getState().updateMessage('msg-1', { content: 'Updated content' });

      const updatedMessage = useChatStore.getState().activeThread?.messages[0];
      expect(updatedMessage?.content).toBe('Updated content');
    });

    it('does nothing for non-existent message', () => {
      const thread = useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      useChatStore.getState().addMessage(mockMessage);
      useChatStore.getState().updateMessage('non-existent', { content: 'Updated' });

      expect(useChatStore.getState().activeThread?.messages[0].content).toBe('Hello AI');
    });
  });

  describe('removeMessage', () => {
    it('removes message from active thread', () => {
      useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      useChatStore.getState().addMessage(mockMessage);
      expect(useChatStore.getState().activeThread?.messages).toHaveLength(1);

      useChatStore.getState().removeMessage('msg-1');
      expect(useChatStore.getState().activeThread?.messages).toHaveLength(0);
    });
  });

  describe('truncateAfter', () => {
    it('removes messages including the specified message and everything after', () => {
      useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      useChatStore.getState().addMessage({ ...mockMessage, id: 'msg-1' });
      useChatStore.getState().addMessage({ ...mockMessage, id: 'msg-2' });
      useChatStore.getState().addMessage({ ...mockMessage, id: 'msg-3' });

      useChatStore.getState().truncateAfter('msg-2', { inclusive: true });

      const messages = useChatStore.getState().activeThread?.messages;
      expect(messages).toHaveLength(1);
      expect(messages?.map((m) => m.id)).toEqual(['msg-1']);
    });

    it('removes messages after specified message, keeping the specified message', () => {
      useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      useChatStore.getState().addMessage({ ...mockMessage, id: 'msg-1' });
      useChatStore.getState().addMessage({ ...mockMessage, id: 'msg-2' });
      useChatStore.getState().addMessage({ ...mockMessage, id: 'msg-3' });

      useChatStore.getState().truncateAfter('msg-2');

      const messages = useChatStore.getState().activeThread?.messages;
      expect(messages).toHaveLength(2);
      expect(messages?.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
    });
  });

  describe('deleteThread', () => {
    it('removes thread from list via storage adapter', async () => {
      const thread = useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      expect(useChatStore.getState().threads).toHaveLength(1);

      await useChatStore.getState().deleteThread({
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
        threadId: thread.id,
      });

      expect(mockStorageAdapter.deleteThread).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
        'main',
        thread.id
      );
    });

    it('clears activeThread if deleted thread was active', async () => {
      const thread = useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      await useChatStore.getState().deleteThread({
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main',
        threadId: thread.id,
      });

      expect(useChatStore.getState().activeThread).toBeNull();
    });
  });

  describe('renameThread', () => {
    it('updates thread title', () => {
      const thread = useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      useChatStore.getState().renameThread({ threadId: thread.id, title: 'New Title' });

      expect(useChatStore.getState().threads[0].title).toBe('New Title');
      expect(useChatStore.getState().activeThread?.title).toBe('New Title');
    });

    it('handles empty title by using default', () => {
      const thread = useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      useChatStore.getState().renameThread({ threadId: thread.id, title: '   ' });

      expect(useChatStore.getState().threads[0].title).toBe('New Chat');
    });
  });

  describe('setStreaming', () => {
    it('updates isStreaming state', () => {
      expect(useChatStore.getState().isStreaming).toBe(false);

      useChatStore.getState().setStreaming(true);

      expect(useChatStore.getState().isStreaming).toBe(true);

      useChatStore.getState().setStreaming(false);

      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });

  describe('clearActiveThread', () => {
    it('clears active thread and stops streaming', () => {
      useChatStore.getState().createThread({
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        branch: 'main',
        filePath: 'chats/test.json',
      });

      useChatStore.getState().setStreaming(true);

      useChatStore.getState().clearActiveThread();

      expect(useChatStore.getState().activeThread).toBeNull();
      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });

  describe('setStorageAdapter', () => {
    it('updates storage adapter', () => {
      const newAdapter = {
        loadThreadSummaries: jest.fn(),
        loadThread: jest.fn(),
        saveThread: jest.fn(),
        deleteThread: jest.fn(),
      };

      useChatStore.getState().setStorageAdapter(newAdapter as any);

      expect(useChatStore.getState().storageAdapter).toBe(newAdapter);
    });
  });

  describe('clearError', () => {
    it('clears error state', () => {
      useChatStore.setState({ error: 'Some error' });

      useChatStore.getState().clearError();

      expect(useChatStore.getState().error).toBeNull();
    });
  });
});

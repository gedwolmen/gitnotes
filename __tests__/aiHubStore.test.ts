jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: jest.fn((key: string) => key) },
}));

jest.mock('../src/stores/aiStore', () => {
  let state: Record<string, any> = {
    chatRepoOwner: null,
    chatRepoName: null,
    chatRepoBranch: 'main',
    selectedModelId: null,
    getAvailableModels: jest.fn(() => []),
  };
  return {
    useAIStore: Object.assign(
      jest.fn((selector?: (s: typeof state) => unknown) =>
        selector ? selector(state) : state
      ),
      {
        getState: () => state,
        __setMockState: (next: Record<string, any>) => {
          state = { ...state, ...next };
        },
        __reset: () => {
          state = {
            chatRepoOwner: null,
            chatRepoName: null,
            chatRepoBranch: 'main',
            selectedModelId: null,
            getAvailableModels: jest.fn(() => []),
          };
        },
      }
    ),
  };
});

jest.mock('../src/stores/chatStore', () => {
  const createThread = jest.fn(({ repoOwner, repoName, branch, filePath }) => ({
    id: 'thread-1',
    title: 'New Chat',
    messages: [],
    createdAt: 123,
    updatedAt: 123,
    repoOwner,
    repoName,
    branch,
    filePath,
  }));
  return {
    useChatStore: Object.assign(jest.fn(), {
      getState: () => ({ createThread }),
    }),
  };
});

import { Alert } from 'react-native';
import { useAIHubStore } from '../src/stores/aiHubStore';
import { useAIStore } from '../src/stores/aiStore';
import { useChatStore } from '../src/stores/chatStore';

type AIStoreMock = typeof useAIStore & {
  __setMockState: (next: Record<string, unknown>) => void;
  __reset: () => void;
};

const aiStoreMock = useAIStore as unknown as AIStoreMock;

const createNavigation = () => ({
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn(() => false),
  isReady: jest.fn(() => true),
  getCurrentRoute: jest.fn(() => ({ name: 'HomeTab' })),
});

beforeEach(() => {
  jest.clearAllMocks();
  aiStoreMock.__reset();
  useAIHubStore.setState({ pickerVisible: false });
});

describe('useAIHubStore', () => {
  describe('picker transitions', () => {
    it('starts with pickerVisible false', () => {
      expect(useAIHubStore.getState().pickerVisible).toBe(false);
    });

    it('openChatRepoPicker sets pickerVisible to true', () => {
      useAIHubStore.getState().openChatRepoPicker();
      expect(useAIHubStore.getState().pickerVisible).toBe(true);
    });

    it('closeChatRepoPicker sets pickerVisible to false', () => {
      useAIHubStore.setState({ pickerVisible: true });
      useAIHubStore.getState().closeChatRepoPicker();
      expect(useAIHubStore.getState().pickerVisible).toBe(false);
    });

    it('open then close returns to false', () => {
      const { openChatRepoPicker, closeChatRepoPicker } = useAIHubStore.getState();
      openChatRepoPicker();
      expect(useAIHubStore.getState().pickerVisible).toBe(true);
      closeChatRepoPicker();
      expect(useAIHubStore.getState().pickerVisible).toBe(false);
    });
  });

  describe('goNewChat', () => {
    it('opens picker when no chat repo configured', () => {
      const navigation = createNavigation();
      useAIHubStore.getState().goNewChat(navigation as any);
      expect(useAIHubStore.getState().pickerVisible).toBe(true);
      expect(navigation.navigate).not.toHaveBeenCalled();
    });

    it('shows Alert when no model selected', () => {
      aiStoreMock.__setMockState({
        chatRepoOwner: 'owner',
        chatRepoName: 'repo',
        chatRepoBranch: 'main',
        selectedModelId: null,
        getAvailableModels: jest.fn(() => []),
      });

      const navigation = createNavigation();
      useAIHubStore.getState().goNewChat(navigation as any);

      expect(Alert.alert).toHaveBeenCalledWith(
        'chat.aiNotConfiguredTitle',
        'chat.aiNotConfiguredBody',
      );
      expect(useAIHubStore.getState().pickerVisible).toBe(false);
      expect(navigation.navigate).not.toHaveBeenCalled();
    });

    it('creates thread and navigates on happy path', () => {
      aiStoreMock.__setMockState({
        chatRepoOwner: 'owner',
        chatRepoName: 'repo',
        chatRepoBranch: 'main',
        selectedModelId: 'model-1',
        getAvailableModels: jest.fn(() => [{ id: 'model-1' }]),
      });

      const navigation = createNavigation();
      useAIHubStore.getState().goNewChat(navigation as any);

      const { createThread } = (useChatStore as any).getState();
      expect(createThread).toHaveBeenCalledWith(
        expect.objectContaining({
          repoOwner: 'owner',
          repoName: 'repo',
          branch: 'main',
        }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith('ChatScreen', { threadId: 'thread-1' });
    });
  });

  describe('goChatHistory', () => {
    it('navigates to ChatThreadList', () => {
      const navigation = createNavigation();
      useAIHubStore.getState().goChatHistory(navigation as any);
      expect(navigation.navigate).toHaveBeenCalledWith('ChatThreadList');
    });
  });

  describe('goAISettings', () => {
    it('navigates to MainTabs/SettingsTab', () => {
      const navigation = createNavigation();
      useAIHubStore.getState().goAISettings(navigation as any);
      expect(navigation.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'SettingsTab' });
    });
  });

  describe('goThoughtDump', () => {
    it('navigates to ThoughtDump', () => {
      const navigation = createNavigation();
      useAIHubStore.getState().goThoughtDump(navigation as any);
      expect(navigation.navigate).toHaveBeenCalledWith('ThoughtDump');
    });
  });
});

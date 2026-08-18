jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: jest.fn((key: string) => key) },
}));

jest.mock('../src/stores/aiStore', () => {
  let state: Record<string, unknown> = {
    chatRepoOwner: null,
    chatRepoName: null,
    chatRepoBranch: 'main',
    selectedModelId: null,
    getAvailableModels: jest.fn(() => []),
  };
  return {
    useAIStore: Object.assign(
      jest.fn((selector?: (s: Record<string, unknown>) => unknown) =>
        selector ? selector(state) : state
      ),
      {
        getState: () => state,
        __setMockState: (next: Record<string, unknown>) => {
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
  const createThread = jest.fn(() => ({
    id: 'thread-1',
    title: 'New Chat',
    messages: [],
    createdAt: 123,
    updatedAt: 123,
  }));
  return {
    useChatStore: Object.assign(jest.fn(), {
      getState: () => ({ createThread }),
    }),
  };
});

import { useAIHubStore } from '../src/stores/aiHubStore';
import { useAIStore } from '../src/stores/aiStore';
import { useChatStore } from '../src/stores/chatStore';
import { __setProState } from '../src/stores/proStore';

type AIStoreMock = typeof useAIStore & {
  __setMockState: (next: Record<string, unknown>) => void;
  __reset: () => void;
};

const aiStoreMock = useAIStore as AIStoreMock;
const createThreadMock = (useChatStore.getState() as { createThread: jest.Mock }).createThread;
const navigate = jest.fn();
const navigation = { navigate } as never;

function setFree(): void {
  __setProState({ status: 'free', entitlementActive: false, isGrandfathered: false });
}

function setPro(): void {
  __setProState({ status: 'pro', entitlementActive: true, isGrandfathered: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  aiStoreMock.__reset();
  setFree();
});

describe('aiHubStore pro gating', () => {
  it.each(['goNewChat', 'goChatHistory', 'goAISettings', 'goThoughtDump', 'goVoiceDump'] as const)(
    '%s routes a free user to the Paywall',
    (action) => {
      useAIHubStore.getState()[action](navigation);
      expect(navigate).toHaveBeenCalledWith('Paywall');
    },
  );

  it('does not create a thread for a free user tapping new chat', () => {
    aiStoreMock.__setMockState({
      chatRepoOwner: 'owner',
      chatRepoName: 'repo',
      chatRepoBranch: 'main',
      selectedModelId: 'model',
      getAvailableModels: () => [{ id: 'model' }],
    });
    useAIHubStore.getState().goNewChat(navigation);
    expect(navigate).toHaveBeenCalledWith('Paywall');
    expect(createThreadMock).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith('ChatScreen', expect.anything());
  });

  it('goNewChat for a pro user with a repo and model navigates to ChatScreen', () => {
    setPro();
    aiStoreMock.__setMockState({
      chatRepoOwner: 'owner',
      chatRepoName: 'repo',
      chatRepoBranch: 'main',
      selectedModelId: 'model',
      getAvailableModels: () => [{ id: 'model' }],
    });
    useAIHubStore.getState().goNewChat(navigation);
    expect(navigate).toHaveBeenCalledWith('ChatScreen', expect.objectContaining({ threadId: 'thread-1' }));
  });

  it('goNewChat for a pro user without a chat repo opens the repo picker', () => {
    setPro();
    useAIHubStore.getState().goNewChat(navigation);
    expect(useAIHubStore.getState().pickerVisible).toBe(true);
    expect(navigate).not.toHaveBeenCalledWith('Paywall');
  });

  it('goChatHistory for a pro user navigates to the thread list', () => {
    setPro();
    useAIHubStore.getState().goChatHistory(navigation);
    expect(navigate).toHaveBeenCalledWith('ChatThreadList');
  });

  it('goThoughtDump for a pro user navigates to the dump screen', () => {
    setPro();
    useAIHubStore.getState().goThoughtDump(navigation);
    expect(navigate).toHaveBeenCalledWith('ThoughtDump');
  });
});

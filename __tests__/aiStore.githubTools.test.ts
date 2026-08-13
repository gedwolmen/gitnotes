jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
      __reset: () => {
        store = {};
      },
    },
  };
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('../src/services/ChatStorageService', () => ({
  setChatRepoAccount: jest.fn(),
}));

jest.mock('../src/services/ai/providerAvailability', () => ({
  resolveProviderAvailability: jest.fn(async () => ({ kind: 'available' })),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAIStore } from '../src/stores/aiStore';

const AI_SETTINGS_KEY = 'ai-settings';
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & {
  __reset: () => void;
};

describe('useAIStore - githubToolsEnabled', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockAsyncStorage.__reset();
    await useAIStore.getState().loadSettings();
    useAIStore.setState({ githubToolsEnabled: false });
  });

  test('defaults to false when nothing is stored', () => {
    expect(useAIStore.getState().githubToolsEnabled).toBe(false);
  });

  test('toggleGithubTools flips false → true → false', async () => {
    await useAIStore.getState().toggleGithubTools();
    expect(useAIStore.getState().githubToolsEnabled).toBe(true);

    await useAIStore.getState().toggleGithubTools();
    expect(useAIStore.getState().githubToolsEnabled).toBe(false);
  });

  test('persists githubToolsEnabled in the ai-settings blob', async () => {
    await useAIStore.getState().toggleGithubTools();

    const settingsCalls = mockAsyncStorage.setItem.mock.calls.filter(
      ([key]) => key === AI_SETTINGS_KEY,
    );
    expect(settingsCalls.length).toBeGreaterThan(0);

    const lastCall = settingsCalls[settingsCalls.length - 1];
    expect(lastCall).toBeDefined();
    const [, serialized] = lastCall;
    expect(serialized).toContain('"githubToolsEnabled":true');

    const parsed = JSON.parse(serialized) as { githubToolsEnabled?: boolean };
    expect(parsed.githubToolsEnabled).toBe(true);
  });

  test('loading a persisted blob without githubToolsEnabled falls back to false', async () => {
    const legacyBlob = {
      isEnabled: true,
      selectedModelId: null,
      actionMode: 'auto',
      chatRepoOwner: null,
      chatRepoName: null,
      chatRepoBranch: 'main',
      chatRepoAccountId: null,
      providers: [],
      dailyQuoteEnabled: true,
      aiPersonalizationEnabled: true,
      // githubToolsEnabled intentionally absent — simulates a blob written
      // before the GitHub tools feature shipped.
    };
    await mockAsyncStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(legacyBlob));

    await useAIStore.getState().loadSettings();

    expect(useAIStore.getState().githubToolsEnabled).toBe(false);
  });
});

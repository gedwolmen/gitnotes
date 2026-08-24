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

jest.mock('../../src/services/ChatStorageService', () => ({
  setChatRepoAccount: jest.fn(),
}));

jest.mock('../../src/services/ai/providerAvailability', () => ({
  resolveProviderAvailability: jest.fn(async () => ({ kind: 'available' })),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAIStore } from '../../src/stores/aiStore';
import { setChatRepoAccount } from '../../src/services/ChatStorageService';
import type { AIProviderConfig } from '../../src/models/AIProvider';

const mockProvider: AIProviderConfig = {
  id: 'test-provider',
  type: 'openai',
  name: 'Test Provider',
  isEnabled: true,
  addedAt: Date.now(),
  supportedPlatforms: ['ios', 'android'],
  models: [
    {
      id: 'test-model',
      name: 'Test Model',
      providerId: 'test-provider',
      providerType: 'openai',
      requiresDownload: false,
    },
  ],
};

describe('useAIStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage as any).__reset?.();
    useAIStore.setState({
      isEnabled: true,
      selectedModelId: null,
      actionMode: 'auto',
      chatRepoOwner: null,
      chatRepoName: null,
      chatRepoBranch: 'main',
      chatRepoAccountId: null,
      providers: [
        {
          id: 'apple-default',
          type: 'apple',
          name: 'Apple Intelligence',
          isEnabled: true,
          addedAt: 0,
          supportedPlatforms: ['ios'],
          models: [
            {
              id: 'apple-foundation',
              name: 'Foundation Model',
              providerId: 'apple-default',
              providerType: 'apple',
              requiresDownload: false,
            },
          ],
        },
      ],
      isLoading: false,
      error: null,
    });
  });

  describe('toggleAI', () => {
    it('toggles isEnabled state and persists', async () => {
      expect(useAIStore.getState().isEnabled).toBe(true);
      await useAIStore.getState().toggleAI();
      expect(useAIStore.getState().isEnabled).toBe(false);
      await useAIStore.getState().toggleAI();
      expect(useAIStore.getState().isEnabled).toBe(true);
    });
  });

  describe('setEnabled', () => {
    it('sets isEnabled to given value and persists', async () => {
      await useAIStore.getState().setEnabled(false);
      expect(useAIStore.getState().isEnabled).toBe(false);
      await useAIStore.getState().setEnabled(true);
      expect(useAIStore.getState().isEnabled).toBe(true);
    });
  });

  describe('selectModel / getSelectedModel', () => {
    it('getSelectedModel returns undefined when nothing selected', () => {
      useAIStore.setState({ selectedModelId: null, providers: [mockProvider] });
      expect(useAIStore.getState().getSelectedModel()).toBeUndefined();
    });

    it('getSelectedModel returns model with providerId when selected', () => {
      useAIStore.setState({ selectedModelId: 'test-model', providers: [mockProvider] });
      const model = useAIStore.getState().getSelectedModel();
      expect(model).toBeDefined();
      expect(model?.id).toBe('test-model');
      expect(model?.providerId).toBe('test-provider');
    });

    it('selectModel sets selectedModelId', async () => {
      useAIStore.setState({ providers: [mockProvider] });
      await useAIStore.getState().selectModel('test-model');
      expect(useAIStore.getState().selectedModelId).toBe('test-model');
    });
  });

  describe('addProvider', () => {
    it('adds new provider and filters duplicates by id', async () => {
      await useAIStore.getState().addProvider(mockProvider);
      const providers = useAIStore.getState().providers;
      expect(providers.some((p) => p.id === 'test-provider')).toBe(true);
      // add same id again - should replace
      const updatedProvider = { ...mockProvider, name: 'Updated Provider' };
      await useAIStore.getState().addProvider(updatedProvider);
      const finalProviders = useAIStore.getState().providers;
      const found = finalProviders.find((p) => p.id === 'test-provider');
      expect(found?.name).toBe('Updated Provider');
    });
  });

  describe('updateProvider', () => {
    it('updates existing provider fields', async () => {
      useAIStore.setState({ providers: [mockProvider] });
      await useAIStore.getState().updateProvider('test-provider', { name: 'Renamed Provider', isEnabled: false });
      const provider = useAIStore.getState().providers.find((p) => p.id === 'test-provider');
      expect(provider?.name).toBe('Renamed Provider');
      expect(provider?.isEnabled).toBe(false);
    });

    it('merges models array correctly', async () => {
      useAIStore.setState({ providers: [mockProvider] });
      const newModels = [
        ...mockProvider.models,
        { id: 'model-2', name: 'Model 2', providerId: 'test-provider', providerType: 'openai', requiresDownload: false },
      ];
      await useAIStore.getState().updateProvider('test-provider', { models: newModels });
      const provider = useAIStore.getState().providers.find((p) => p.id === 'test-provider');
      expect(provider?.models).toHaveLength(2);
    });
  });

  describe('removeProvider', () => {
    it('removes provider from list', async () => {
      useAIStore.setState({ providers: [mockProvider], selectedModelId: 'test-model' });
      await useAIStore.getState().removeProvider('test-provider');
      expect(useAIStore.getState().providers.find((p) => p.id === 'test-provider')).toBeUndefined();
    });

    it('clears selectedModelId when removing its provider', async () => {
      useAIStore.setState({ providers: [mockProvider], selectedModelId: 'test-model' });
      await useAIStore.getState().removeProvider('test-provider');
      expect(useAIStore.getState().selectedModelId).toBeNull();
    });
  });

  describe('setChatRepo', () => {
    it('sets chat repo fields and calls ChatStorageService.setChatRepoAccount', async () => {
      await useAIStore.getState().setChatRepo('owner', 'repo', 'main', 'account-123');
      const state = useAIStore.getState();
      expect(state.chatRepoOwner).toBe('owner');
      expect(state.chatRepoName).toBe('repo');
      expect(state.chatRepoBranch).toBe('main');
      expect(state.chatRepoAccountId).toBe('account-123');
      expect(setChatRepoAccount).toHaveBeenCalledWith('account-123');
    });

    it('uses default branch when not specified', async () => {
      await useAIStore.getState().setChatRepo('owner', 'repo');
      expect(useAIStore.getState().chatRepoBranch).toBe('main');
    });
  });

  describe('getAvailableModels', () => {
    it('returns flattened models from enabled providers only', () => {
      const providers: AIProviderConfig[] = [
        { ...mockProvider, isEnabled: true },
        { ...mockProvider, id: 'disabled', name: 'Disabled', isEnabled: false, models: [{ id: 'd-model', name: 'Disabled Model', providerId: 'disabled', providerType: 'openai', requiresDownload: false }] },
      ];
      useAIStore.setState({ providers });
      const models = useAIStore.getState().getAvailableModels();
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('test-model');
    });
  });

  describe('loadSettings / persistSettings', () => {
    it('loadSettings applies default settings when nothing stored', async () => {
      (AsyncStorage as any).__reset?.();
      await useAIStore.getState().loadSettings();
      const state = useAIStore.getState();
      expect(state.isEnabled).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('persistSettings saves current state to AsyncStorage', async () => {
      useAIStore.setState({ isEnabled: false, actionMode: 'manual' });
      await useAIStore.getState().persistSettings();
      const stored = await AsyncStorage.getItem('ai-settings');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.isEnabled).toBe(false);
      expect(parsed.actionMode).toBe('manual');
    });

    it('dailyQuotePersonalizationEnabled defaults to false when nothing stored (#1172)', async () => {
      (AsyncStorage as any).__reset?.();
      await useAIStore.getState().loadSettings();
      expect(useAIStore.getState().dailyQuotePersonalizationEnabled).toBe(false);
    });

    it('toggleDailyQuotePersonalization flips state to false', async () => {
      useAIStore.setState({ dailyQuotePersonalizationEnabled: true });
      await useAIStore.getState().toggleDailyQuotePersonalization();
      expect(useAIStore.getState().dailyQuotePersonalizationEnabled).toBe(false);
    });

    it('toggleDailyQuotePersonalization twice returns to true', async () => {
      useAIStore.setState({ dailyQuotePersonalizationEnabled: true });
      await useAIStore.getState().toggleDailyQuotePersonalization();
      await useAIStore.getState().toggleDailyQuotePersonalization();
      expect(useAIStore.getState().dailyQuotePersonalizationEnabled).toBe(true);
    });

    it('persists false value to AsyncStorage', async () => {
      useAIStore.setState({ dailyQuotePersonalizationEnabled: true });
      await useAIStore.getState().toggleDailyQuotePersonalization();
      await useAIStore.getState().persistSettings();
      const stored = await AsyncStorage.getItem('ai-settings');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.dailyQuotePersonalizationEnabled).toBe(false);
    });

    it('loadSettings restores false from stored settings', async () => {
      await AsyncStorage.setItem('ai-settings', JSON.stringify({ dailyQuotePersonalizationEnabled: false }));
      await useAIStore.getState().loadSettings();
      expect(useAIStore.getState().dailyQuotePersonalizationEnabled).toBe(false);
    });

    it('loadSettings defaults legacy blob (missing field) to false (#1172)', async () => {
      await AsyncStorage.setItem('ai-settings', JSON.stringify({ isEnabled: true }));
      await useAIStore.getState().loadSettings();
      expect(useAIStore.getState().dailyQuotePersonalizationEnabled).toBe(false);
    });
  });

  describe('fresh-install defaults', () => {
    it('keeps AI off and curated daily quote on with no model selected (#1172)', async () => {
      (AsyncStorage as any).__reset?.();
      await useAIStore.getState().loadSettings();
      const state = useAIStore.getState();
      expect(state.isEnabled).toBe(false);
      expect(state.selectedModelId).toBeNull();
      expect(state.aiPersonalizationEnabled).toBe(false);
      expect(state.dailyQuotePersonalizationEnabled).toBe(false);
      expect(state.dailyQuoteEnabled).toBe(true);
    });
  });
});
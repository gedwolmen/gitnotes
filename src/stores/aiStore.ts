import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { AIActionMode, AIModelConfig, AIProviderConfig, AISettings } from '../models/AIProvider';

const AI_SETTINGS_STORAGE_KEY = 'ai-settings';
const AI_PROVIDER_KEY_PREFIX = 'ai-provider-key-';

interface AIState {
  isEnabled: boolean;
  selectedModelId: string | null;
  actionMode: AIActionMode;
  chatRepoOwner: string | null;
  chatRepoName: string | null;
  chatRepoBranch: string;
  providers: AIProviderConfig[];
  isLoading: boolean;
  error: string | null;
}

interface AIActions {
  toggleAI: () => Promise<void>;
  setActionMode: (mode: AIActionMode) => Promise<void>;
  selectModel: (modelId: string | null) => Promise<void>;
  addProvider: (provider: AIProviderConfig) => Promise<void>;
  updateProvider: (providerId: string, updates: Partial<AIProviderConfig>) => Promise<void>;
  removeProvider: (providerId: string) => Promise<void>;
  setChatRepo: (owner: string | null, name: string | null, branch?: string) => Promise<void>;
  getAvailableModels: () => AIModelConfig[];
  getSelectedModel: () => AIModelConfig | undefined;
  persistSettings: () => Promise<void>;
  loadSettings: () => Promise<void>;
}

const createDefaultProviders = (): AIProviderConfig[] => [
  {
    id: 'apple-default',
    type: 'apple',
    name: 'Apple Intelligence',
    isEnabled: true,
    addedAt: 0,
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
  {
    id: 'llama-default',
    type: 'llama',
    name: 'Llama (On-Device)',
    isEnabled: true,
    addedAt: 0,
    models: [
      {
        id: 'llama-smol',
        name: 'SmolLM3 3B',
        providerId: 'llama-default',
        providerType: 'llama',
        requiresDownload: true,
        downloadSize: '~2GB',
        isDownloaded: false,
      },
    ],
  },
];

const createDefaultSettings = (): AISettings => ({
  isEnabled: true,
  selectedModelId: null,
  actionMode: 'auto',
  chatRepoOwner: null,
  chatRepoName: null,
  chatRepoBranch: 'main',
  providers: createDefaultProviders(),
});

const getProviderApiKeyStorageKey = (providerId: string) => `${AI_PROVIDER_KEY_PREFIX}${providerId}`;

const stripProviderApiKey = ({ apiKey: _apiKey, ...provider }: AIProviderConfig): AIProviderConfig => provider;

const mergeProviders = (storedProviders?: AIProviderConfig[]): AIProviderConfig[] => {
  const defaultProviders = createDefaultProviders();

  if (!storedProviders?.length) {
    return defaultProviders;
  }

  const mergedDefaults = defaultProviders.map((defaultProvider) => {
    const storedProvider = storedProviders.find((provider) => provider.id === defaultProvider.id);

    if (!storedProvider) {
      return defaultProvider;
    }

    return {
      ...defaultProvider,
      ...storedProvider,
      models: storedProvider.models?.length ? storedProvider.models : defaultProvider.models,
    };
  });

  const customProviders = storedProviders.filter(
    (provider) => !defaultProviders.some((defaultProvider) => defaultProvider.id === provider.id)
  );

  return [...mergedDefaults, ...customProviders];
};

const hydrateProviderApiKeys = async (providers: AIProviderConfig[]): Promise<AIProviderConfig[]> =>
  Promise.all(
    providers.map(async (provider) => {
      const apiKey = await SecureStore.getItemAsync(getProviderApiKeyStorageKey(provider.id));
      return apiKey ? { ...provider, apiKey } : provider;
    })
  );

export const useAIStore = create<AIState & AIActions>()((set, get) => ({
  ...createDefaultSettings(),
  isLoading: true,
  error: null,

  toggleAI: async () => {
    set((state) => ({ isEnabled: !state.isEnabled, error: null }));
    await get().persistSettings();
  },

  setActionMode: async (mode) => {
    set({ actionMode: mode, error: null });
    await get().persistSettings();
  },

  selectModel: async (modelId) => {
    set({ selectedModelId: modelId, error: null });
    await get().persistSettings();
  },

  addProvider: async (provider) => {
    set((state) => ({
      providers: [...state.providers.filter((existingProvider) => existingProvider.id !== provider.id), provider],
      error: null,
    }));
    await get().persistSettings();
  },

  updateProvider: async (providerId, updates) => {
    set((state) => ({
      providers: state.providers.map((provider) =>
        provider.id === providerId
          ? {
              ...provider,
              ...updates,
              models: updates.models ?? provider.models,
            }
          : provider
      ),
      error: null,
    }));
    await get().persistSettings();
  },

  removeProvider: async (providerId) => {
    const selectedModel = get().getSelectedModel();

    set((state) => ({
      providers: state.providers.filter((provider) => provider.id !== providerId),
      selectedModelId: selectedModel?.providerId === providerId ? null : state.selectedModelId,
      error: null,
    }));

    try {
      await SecureStore.deleteItemAsync(getProviderApiKeyStorageKey(providerId));
    } catch (err) {
      set({ error: 'Failed to remove AI provider key' });
      console.error('Error removing AI provider key:', err);
    }

    await get().persistSettings();
  },

  setChatRepo: async (owner, name, branch = 'main') => {
    set({
      chatRepoOwner: owner,
      chatRepoName: name,
      chatRepoBranch: branch,
      error: null,
    });
    await get().persistSettings();
  },

  getAvailableModels: () =>
    get()
      .providers.filter((provider) => provider.isEnabled)
      .flatMap((provider) => provider.models),

  getSelectedModel: () => {
    const { selectedModelId, providers } = get();

    if (!selectedModelId) {
      return undefined;
    }

    for (const provider of providers) {
      if (!provider.isEnabled) continue;
      const model = provider.models.find((m) => m.id === selectedModelId);
      if (model) {
        return { ...model, providerId: provider.id };
      }
    }

    return undefined;
  },

  persistSettings: async () => {
    try {
      const {
        isEnabled,
        selectedModelId,
        actionMode,
        chatRepoOwner,
        chatRepoName,
        chatRepoBranch,
        providers,
      } = get();

      await Promise.all(
        providers.map(async (provider) => {
          const storageKey = getProviderApiKeyStorageKey(provider.id);

          if (provider.apiKey) {
            await SecureStore.setItemAsync(storageKey, provider.apiKey);
            return;
          }

          await SecureStore.deleteItemAsync(storageKey);
        })
      );

      const settingsToPersist: AISettings = {
        isEnabled,
        selectedModelId,
        actionMode,
        chatRepoOwner,
        chatRepoName,
        chatRepoBranch,
        providers: providers.map(stripProviderApiKey),
      };

      await AsyncStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settingsToPersist));
      set({ error: null });
    } catch (err) {
      set({ error: 'Failed to persist AI settings' });
      console.error('Error persisting AI settings:', err);
    }
  },

  loadSettings: async () => {
    try {
      set({ isLoading: true, error: null });

      const savedSettingsRaw = await AsyncStorage.getItem(AI_SETTINGS_STORAGE_KEY);

      if (!savedSettingsRaw) {
        const defaultSettings = createDefaultSettings();
        const providers = await hydrateProviderApiKeys(defaultSettings.providers);
        set({ ...defaultSettings, providers, isLoading: false, error: null });
        return;
      }

      const savedSettings = JSON.parse(savedSettingsRaw) as Partial<AISettings>;
      const defaultSettings = createDefaultSettings();

      const mergedSettings: AISettings = {
        ...defaultSettings,
        ...savedSettings,
        chatRepoBranch: savedSettings.chatRepoBranch ?? defaultSettings.chatRepoBranch,
        providers: mergeProviders(savedSettings.providers),
      };

      const providers = await hydrateProviderApiKeys(mergedSettings.providers);

      set({
        ...mergedSettings,
        providers,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const defaultSettings = createDefaultSettings();
      set({
        ...defaultSettings,
        isLoading: false,
        error: 'Failed to load AI settings',
      });
      console.error('Error loading AI settings:', err);
    }
  },
}));

void useAIStore.getState().loadSettings();

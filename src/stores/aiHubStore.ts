import { Alert } from 'react-native';
import { create } from 'zustand';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import i18n from 'i18next';
import { RootStackParamList } from '../navigation/types';
import { useAIStore } from './aiStore';
import { useChatStore } from './chatStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface AIHubState {
  pickerVisible: boolean;
}

interface AIHubActions {
  openChatRepoPicker: () => void;
  closeChatRepoPicker: () => void;
  goNewChat: (navigation: NavigationProp) => void;
  goChatHistory: (navigation: NavigationProp) => void;
  goAISettings: (navigation: NavigationProp) => void;
  goThoughtDump: (navigation: NavigationProp) => void;
}

export const useAIHubStore = create<AIHubState & AIHubActions>()((set, get) => ({
  pickerVisible: false,

  openChatRepoPicker: () => set({ pickerVisible: true }),

  closeChatRepoPicker: () => set({ pickerVisible: false }),

  goNewChat: (navigation) => {
    const { chatRepoOwner, chatRepoName, chatRepoBranch, selectedModelId, getAvailableModels } =
      useAIStore.getState();

    if (!chatRepoOwner || !chatRepoName || !chatRepoBranch) {
      get().openChatRepoPicker();
      return;
    }

    const availableModels = getAvailableModels();
    if (!selectedModelId || availableModels.length === 0) {
      Alert.alert(
        i18n.t('chat.aiNotConfiguredTitle'),
        i18n.t('chat.aiNotConfiguredBody'),
      );
      return;
    }

    const { createThread } = useChatStore.getState();
    const thread = createThread({
      repoOwner: chatRepoOwner,
      repoName: chatRepoName,
      branch: chatRepoBranch,
      filePath: `chats/${Date.now()}.json`,
    });
    navigation.navigate('ChatScreen', { threadId: thread.id });
  },

  goChatHistory: (navigation) => {
    navigation.navigate('ChatThreadList');
  },

  goAISettings: (navigation) => {
    navigation.navigate('MainTabs', { screen: 'SettingsTab' });
  },

  goThoughtDump: (navigation) => {
    navigation.navigate('ThoughtDump');
  },
}));

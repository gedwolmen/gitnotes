import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import SettingsScreen from '../../src/screens/SettingsScreen';

const mockNavigate = jest.fn();

let mockTheme: 'light' | 'dark' | 'system' = 'light';
let mockUiStyle: 'flat' | 'neumorphic' = 'flat';
const mockSetTheme = jest.fn();
const mockSetStyle = jest.fn();

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true }),
  );
  return {
    __esModule: true,
    default: { addEventListener, fetch },
    addEventListener,
    fetch,
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0' },
  manifest: { version: '1.0.0' },
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

const stableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
  accent: '#8b5cf6',
};

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: stableColors,
    theme: mockTheme,
    setTheme: mockSetTheme,
    style: mockUiStyle,
    setStyle: mockSetStyle,
    isDark: false,
  }),
}));

jest.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    authState: { isAuthenticated: false, token: null },
    accounts: [],
    activeAccountId: null,
    setToken: jest.fn(async () => true),
    clearToken: jest.fn(async () => undefined),
    addAccount: jest.fn(async () => null),
    removeAccount: jest.fn(async () => undefined),
    switchAccount: jest.fn(async () => undefined),
  }),
}));

const stableRepositories: any[] = [];
jest.mock('../../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: stableRepositories, addRepository: jest.fn(), removeRepository: jest.fn() }),
}));

jest.mock('../../src/contexts/NoteContext', () => ({
  useNotes: () => ({
    notes: [],
    clearAllNotes: jest.fn(async () => true),
    refreshNotes: jest.fn(async () => undefined),
    createNote: jest.fn(async () => null),
    updateNote: jest.fn(async () => null),
    getNoteById: jest.fn(() => undefined),
  }),
}));

jest.mock('../../src/contexts/TodoContext', () => ({
  useTodos: () => ({
    todos: [],
    refreshTodos: jest.fn(async () => undefined),
  }),
}));

jest.mock('../../src/contexts/CanvasContext', () => ({
  useCanvases: () => ({
    canvases: [],
    refreshCanvases: jest.fn(async () => undefined),
  }),
}));

jest.mock('../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0 }),
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    setToken: jest.fn(),
    isAuthenticated: jest.fn(() => false),
    getRepositories: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/RepoPullService', () => ({
  pullFromSingleRepo: jest.fn(async () => ({ notes: 0, canvases: 0, todos: 0 })),
  pullAllFromRepos: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/RepoFileSyncService', () => ({
  RepoFileSyncService: { syncRepoFiles: jest.fn(async () => ({ created: 0, skipped: 0, total: 0, errors: [] })) },
}));

jest.mock('../../src/services/TemplateRepoPreferenceService', () => ({
  TemplateRepoPreferenceService: {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/TemplateGitHubSyncService', () => ({
  syncTemplateToGitHub: jest.fn(async () => ({ success: true })),
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(async () => 'api' as const),
    setMode: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: {
    isCloned: jest.fn(async () => false),
    clone: jest.fn(async () => undefined),
    removeRepo: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/git/CloneMigrationService', () => ({
  CloneMigrationService: { migrateRepo: jest.fn(async () => ({ notes: 0, todos: 0, canvases: 0, templates: 0, failures: [] })) },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(async () => null) },
}));

jest.mock('../../src/services/OnboardingService', () => ({
  OnboardingService: { resetOnboarding: jest.fn(async () => undefined) },
}));

jest.mock('../../src/stores/templateStore', () => ({
  useTemplateStore: () => ({ customTemplates: [] }),
}));

const mockAIStore = {
  isEnabled: false,
  selectedModelId: null,
  actionMode: 'auto' as const,
  chatRepoOwner: null,
  chatRepoName: null,
  providers: [] as any[],
  toggleAI: jest.fn(),
  setActionMode: jest.fn(),
  updateProvider: jest.fn(),
  getState: () => mockAIStore,
};

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: (selector: any) => {
    if (selector) return selector(mockAIStore);
    return mockAIStore;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock('../../src/components/ui', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    ScreenHeader: ({ title }: { title: string }) => (
      <Text testID="screen-header">{title}</Text>
    ),
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
    Group: ({ title, children }: any) => (
      <View testID={`group-${title}`}>
        <Text testID="group-title">{title}</Text>
        {children}
      </View>
    ),
    GroupRow: ({ children, trailing, onPress }: any) => (
      <Pressable testID="group-row" onPress={onPress}>
        {children}
        {trailing}
      </Pressable>
    ),
    Toggle: ({ value, onValueChange, testID }: any) => (
      <Pressable testID={testID || 'toggle'} onPress={() => onValueChange(!value)}>
        <Text>{value ? 'On' : 'Off'}</Text>
      </Pressable>
    ),
    Button: ({ label, onPress }: any) => (
      <Pressable testID={`button-${label}`} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    IconButton: ({ onPress, accessibilityLabel }: any) => (
      <Pressable testID={`icon-btn-${accessibilityLabel}`} onPress={onPress}>
        <Text>{accessibilityLabel}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../../src/components/ai/ModelSelector', () => ({
  ModelSelector: () => null,
}));

jest.mock('../../src/components/ai/ProviderConfigModal', () => ({
  ProviderConfigModal: () => null,
}));

jest.mock('../../src/components/ai/ChatRepoPickerModal', () => ({
  ChatRepoPickerModal: () => null,
}));

jest.mock('../../src/components/settings/SettingsModals', () => ({
  SettingsModals: () => null,
}));

jest.mock('../../src/components/settings/settingsStyles', () => {
  const { StyleSheet } = require('react-native');
  return {
    settingsStyles: StyleSheet.create({
      container: { flex: 1 },
      scrollContent: { flex: 1 },
      section: { marginTop: 20, paddingHorizontal: 16, borderRadius: 12, marginHorizontal: 16 },
      sectionTitle: { fontSize: 12, fontWeight: '600' },
      settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
      settingLabel: { fontSize: 16 },
      settingValue: { fontSize: 15 },
      settingLeft: { flexDirection: 'row', alignItems: 'center' },
      authUserRow: { flexDirection: 'row', alignItems: 'center' },
      avatar: { width: 40, height: 40, borderRadius: 20 },
      addRepoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
      addRepoButtonText: { fontSize: 15 },
      disabledButton: { opacity: 0.4 },
      emptyRepos: { paddingVertical: 24, alignItems: 'center' },
      emptyReposText: { fontSize: 15 },
      credits: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
      bottomPad: { height: 40 },
      repoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
      repoInfo: { flex: 1 },
      repoName: { fontSize: 15, fontWeight: '500' },
      repoPath: { fontSize: 13 },
      syncButton: { paddingHorizontal: 8 },
      syncSpinner: { paddingHorizontal: 8 },
      removeButton: { paddingHorizontal: 8 },
    }),
  };
});

jest.mock('../../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({ value, onChangeText }: any) => (
    <TextInput testID="search-bar" value={value} onChangeText={onChangeText} />
  );
});

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockTheme = 'light';
    mockUiStyle = 'flat';
    mockNavigate.mockClear();
    mockSetTheme.mockClear();
    mockSetStyle.mockClear();
  });

  it('renders without crashing', () => {
    const { getByTestId } = render(<SettingsScreen />);
    expect(getByTestId('screen-header')).toBeTruthy();
  });

  it('shows the Settings header title', () => {
    const { getByTestId } = render(<SettingsScreen />);
    expect(getByTestId('screen-header').props.children).toBe('Settings');
  });

  it('shows Appearance section with theme settings', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Dark Mode')).toBeTruthy();
  });

  it('shows About section', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('About')).toBeTruthy();
    expect(getByText('Version')).toBeTruthy();
  });

  it('shows GitHub Account section for unauthenticated users', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('GitHub Account')).toBeTruthy();
    expect(getByText('Connect GitHub')).toBeTruthy();
  });

  it('shows Updated UI toggle', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Updated UI')).toBeTruthy();
  });

  it('shows Repositories section', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Repositories')).toBeTruthy();
    expect(getByText('Add Repository')).toBeTruthy();
  });

  it('shows Data section with clear notes option', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Data')).toBeTruthy();
    expect(getByText('Clear All Notes')).toBeTruthy();
  });
});

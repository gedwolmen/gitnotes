import React from 'react';
import { render } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { SettingsModals } from '../../../src/components/settings/SettingsModals';
import type { GitRepository } from '../../../src/services/GitService';
import type { GitHubRepository } from '../../../src/services/GitHubService';
import type { TemplateRepoPreference } from '../../../src/services/TemplateRepoPreferenceService';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../../../src/components/SearchBar', () => {
  const { TextInput } = jest.requireActual('react-native');
  return ({ value, onChangeText }: any) => (
    <TextInput testID="search-bar" value={value} onChangeText={onChangeText} />
  );
});

jest.mock('../../../src/components/ui', () => {
  const { View, TextInput, Pressable, Text } = jest.requireActual('react-native');
  return {
    Modal: ({ visible, children }: any) => (visible ? <View testID="modal">{children}</View> : null),
    Input: (props: any) => <TextInput {...props} />,
    Button: ({ label, onPress }: any) => (
      <Pressable onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});

const colors = {
  background: '#fff',
  surface: '#f4f4f4',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
};

const repositories: GitRepository[] = [
  { id: '1', name: 'notes', path: 'me/notes', branch: 'main' },
];

const githubRepos: GitHubRepository[] = [
  { id: 1, name: 'notes', full_name: 'me/notes', owner: { login: 'me' }, html_url: 'https://github.com/me/notes', description: '', private: false },
];

const templatesRepoPref: TemplateRepoPreference = { repoPath: 'me/notes', branch: 'main' };

function makeProps(overrides: Partial<React.ComponentProps<typeof SettingsModals>> = {}) {
  return {
    colors,
    authState: { isAuthenticated: false },
    repositories,
    githubRepos,
    templatesRepoPref,
    showRepoPickerModal: false,
    showTemplatesRepoPicker: false,
    showTokenModal: false,
    repoSearchQuery: '',
    manualRepoInput: '',
    isAddingRepo: false,
    isLoadingGithubRepos: false,
    tokenInput: '',
    tokenVisible: false,
    tokenError: null,
    isVerifying: false,
    tokenModalMode: 'add' as const,
    onCloseRepoPicker: jest.fn(),
    onSetRepoSearchQuery: jest.fn(),
    onSetManualRepoInput: jest.fn(),
    onAddManualRepo: jest.fn(),
    onSelectGithubRepo: jest.fn(),
    onCloseTemplatesRepoPicker: jest.fn(),
    onPickTemplatesRepo: jest.fn(),
    onCloseTokenModal: jest.fn(),
    onSetTokenInput: jest.fn(),
    onToggleTokenVisible: jest.fn(),
    onPasteToken: jest.fn(),
    onCopyToken: jest.fn(),
    onSaveToken: jest.fn(),
    ...overrides,
  };
}

function expectBottomPadding(style: unknown) {
  const containerStyle = style as { paddingBottom?: number };
  expect(containerStyle.paddingBottom).toBeGreaterThanOrEqual(16);
  return containerStyle.paddingBottom;
}

describe('SettingsModals repo pickers bottom padding', () => {
  it('adds bottom padding plus safe-area inset to the templates repo picker ScrollView', () => {
    const { UNSAFE_getByType } = render(
      <SettingsModals {...makeProps({ showTemplatesRepoPicker: true })} />,
    );
    const scrollView = UNSAFE_getByType(ScrollView);
    const paddingBottom = expectBottomPadding(scrollView.props.contentContainerStyle);
    expect(paddingBottom).toBe(16 + 34); // 16 padding + mocked bottom safe-area inset
  });

  it('adds bottom padding plus safe-area inset to the repo picker ScrollView', () => {
    const { UNSAFE_getByType } = render(
      <SettingsModals {...makeProps({ showRepoPickerModal: true })} />,
    );
    const scrollView = UNSAFE_getByType(ScrollView);
    const paddingBottom = expectBottomPadding(scrollView.props.contentContainerStyle);
    expect(paddingBottom).toBe(16 + 34); // 16 padding + mocked bottom safe-area inset
  });
});

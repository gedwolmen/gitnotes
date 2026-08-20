import React from 'react';
import { render } from '@testing-library/react-native';
import { ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
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
    Button: ({ label, onPress, disabled, trailingIcon, testID }: any) => (
      <Pressable testID={testID ?? `button-${label}`} onPress={onPress} disabled={disabled}>
        <Text>{label}</Text>
        {trailingIcon}
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
    isAddingRepoPath: null,
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

describe('SettingsModals busy state', () => {
  const extraRepos: GitHubRepository[] = [
    { id: 1, name: 'notes', full_name: 'me/notes', owner: { login: 'me' }, html_url: 'https://github.com/me/notes', description: '', private: false },
    { id: 2, name: 'other', full_name: 'other/repo', owner: { login: 'other' }, html_url: 'https://github.com/other/repo', description: '', private: false },
  ];

  it('renders ActivityIndicator in the row matching isAddingRepoPath', () => {
    const { UNSAFE_getAllByType } = render(
      <SettingsModals
        {...makeProps({
          showRepoPickerModal: true,
          authState: { isAuthenticated: true },
          githubRepos: extraRepos,
          isAddingRepoPath: 'me/notes',
        })}
      />,
    );
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const repoRows = touchables.filter(
      (t: any) => t.props.testID === 'settings-modals.button.select-github-repo',
    );
    expect(repoRows).toHaveLength(2);

    const busyRow = repoRows[0];
    const busyIndicator = busyRow.findAllByType(ActivityIndicator);
    expect(busyIndicator.length).toBeGreaterThanOrEqual(1);

    const otherRow = repoRows[1];
    const otherIndicator = otherRow.findAllByType(ActivityIndicator);
    expect(otherIndicator).toHaveLength(0);
  });

  it('disables all rows and adds dim opacity when isAddingRepoPath is set', () => {
    const { UNSAFE_getAllByType } = render(
      <SettingsModals
        {...makeProps({
          showRepoPickerModal: true,
          authState: { isAuthenticated: true },
          githubRepos: extraRepos,
          isAddingRepoPath: 'me/notes',
        })}
      />,
    );
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const repoRows = touchables.filter(
      (t: any) => t.props.testID === 'settings-modals.button.select-github-repo',
    );
    expect(repoRows).toHaveLength(2);

    expect(repoRows[0].props.disabled).toBe(true);
    expect(repoRows[1].props.disabled).toBe(true);

    const otherRowStyle = repoRows[1].props.style as Array<Record<string, unknown>>;
    const dimEntry = otherRowStyle.find((s) => s && typeof s === 'object' && 'opacity' in s);
    expect(dimEntry).toBeDefined();
    expect((dimEntry as Record<string, number>).opacity).toBe(0.5);
  });

  it('renders a busy indicator on the tapped row when isAddingRepoPath is non-null', () => {
    const { rerender, UNSAFE_queryAllByType } = render(
      <SettingsModals
        {...makeProps({
          showRepoPickerModal: true,
          authState: { isAuthenticated: true },
          githubRepos: extraRepos,
          isAddingRepoPath: null,
        })}
      />,
    );
    let indicators = UNSAFE_queryAllByType(ActivityIndicator).filter(
      (n: any) => n.props.size === 'small' || n.props.size === 'large',
    );
    expect(indicators).toHaveLength(0);

    rerender(
      <SettingsModals
        {...makeProps({
          showRepoPickerModal: true,
          authState: { isAuthenticated: true },
          githubRepos: extraRepos,
          isAddingRepoPath: 'me/notes',
        })}
      />,
    );
    indicators = UNSAFE_queryAllByType(ActivityIndicator);
    expect(indicators.length).toBeGreaterThanOrEqual(1);
  });
});

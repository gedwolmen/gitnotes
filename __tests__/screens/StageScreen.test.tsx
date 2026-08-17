import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

import StageScreen from '../../src/screens/StageScreen';
import { useNavigation } from '@react-navigation/native';
import type { StagedItem } from '../../src/services/git/StagingService';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockLoadStaged = jest.fn(async () => undefined);
const mockRegisterQueueSubscription = jest.fn();
const mockRequestPush = jest.fn();
const mockPushAll = jest.fn();

const mockStageState: {
  staged: StagedItem[];
  isPushing: Record<string, boolean>;
  globalPushing: boolean;
  loadStaged: () => Promise<void>;
  registerQueueSubscription: () => void;
  requestPush: (repoPath?: string, branch?: string) => string | null;
  pushAll: () => void;
} = {
  staged: [],
  isPushing: {},
  globalPushing: false,
  loadStaged: mockLoadStaged,
  registerQueueSubscription: mockRegisterQueueSubscription,
  requestPush: mockRequestPush,
  pushAll: mockPushAll,
};

jest.mock('../../src/services/git/StagingService', () => ({
  StagingService: { listStaged: jest.fn(async () => []) },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: { subscribe: jest.fn(() => () => undefined) },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: { getSavedRepositories: jest.fn(async () => []) },
}));

jest.mock('../../src/stores/stageStore', () => {
  const actual = jest.requireActual('../../src/stores/stageStore');
  return {
    ...actual,
    useStageStore: (selector: (state: typeof mockStageState) => unknown) => selector(mockStageState),
  };
});

jest.mock('../../src/stores/githubActivityStore', () => ({
  useGitHubActivityStore: () => ({ progress: null, visible: false, label: null }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      primary: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
    },
  }),
}));

jest.mock('../../src/components/ui', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    ScreenHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) =>
      React.createElement(
        View,
        { testID: 'stage.screen-header' },
        React.createElement(Text, null, title),
        actions,
      ),
  };
});

function StageNavigationStub() {
  const navigation = useNavigation();
  return (
    <Pressable testID="stage.nav-stub" onPress={() => navigation.navigate('Stage')}>
      <Text>Open Stage</Text>
    </Pressable>
  );
}

const item = (
  repoPath: string,
  branch: string,
  filePath: string,
  kind: StagedItem['kind'] = 'upsert',
): StagedItem => ({
  repoPath,
  branch,
  filePath,
  kind,
  mode: 'api',
});

describe('StageScreen', () => {
  beforeEach(() => {
    mockStageState.staged = [];
    mockStageState.isPushing = {};
    mockStageState.globalPushing = false;
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockLoadStaged.mockClear();
    mockRegisterQueueSubscription.mockClear();
    mockRequestPush.mockClear();
    mockPushAll.mockClear();
  });

  it('renders staged items from two groups with both filePaths visible', () => {
    mockStageState.staged = [
      item('owner/repo-a', 'main', 'notes/a.md'),
      item('owner/repo-a', 'main', 'notes/b.md'),
      item('owner/repo-b', 'develop', 'notes/c.md'),
    ];

    const { getByText } = render(<StageScreen />);

    expect(getByText('notes/a.md')).toBeTruthy();
    expect(getByText('notes/b.md')).toBeTruthy();
    expect(getByText('notes/c.md')).toBeTruthy();
  });

  it('shows the empty state when nothing is staged', () => {
    const { getByText, getByTestId } = render(<StageScreen />);

    expect(getByText('No staged changes')).toBeTruthy();
    expect(getByTestId('stage.empty')).toBeTruthy();
  });

  it('loads staged items and registers the queue subscription on mount', () => {
    render(<StageScreen />);

    expect(mockLoadStaged).toHaveBeenCalledTimes(1);
    expect(mockRegisterQueueSubscription).toHaveBeenCalledTimes(1);
  });

  it('calls requestPush with repoPath and branch when a group Push button is pressed', () => {
    mockStageState.staged = [
      item('owner/repo-a', 'main', 'notes/a.md'),
      item('owner/repo-b', 'develop', 'notes/c.md'),
    ];

    const { getByTestId } = render(<StageScreen />);

    fireEvent.press(getByTestId('stage.push.owner/repo-a::main'));

    expect(mockRequestPush).toHaveBeenCalledWith('owner/repo-a', 'main');
  });

  it('calls pushAll when the header Push all button is pressed', () => {
    mockStageState.staged = [item('owner/repo-a', 'main', 'notes/a.md')];

    const { getByTestId } = render(<StageScreen />);

    fireEvent.press(getByTestId('stage.push-all'));

    expect(mockPushAll).toHaveBeenCalledTimes(1);
  });

  it('disables the group Push button while that key is pushing', () => {
    mockStageState.staged = [item('owner/repo-a', 'main', 'notes/a.md')];
    mockStageState.isPushing = { 'owner/repo-a::main': true };

    const { getByTestId, getByText, UNSAFE_queryByType } = render(<StageScreen />);

    const button = getByTestId('stage.push.owner/repo-a::main');
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(getByText('Push')).toBeTruthy();
    const ActivityIndicator = require('react-native').ActivityIndicator;
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  });

  it('disables the header Push all button (label kept, no spinner) while globalPushing', () => {
    mockStageState.staged = [item('owner/repo-a', 'main', 'notes/a.md')];
    mockStageState.globalPushing = true;

    const { getByTestId, getByText, UNSAFE_queryByType } = render(<StageScreen />);

    const button = getByTestId('stage.push-all');
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(getByText('Push all')).toBeTruthy();
    const ActivityIndicator = require('react-native').ActivityIndicator;
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  });

  it('navigates to the Stage route from a stub trigger', () => {
    const { getByTestId } = render(<StageNavigationStub />);

    fireEvent.press(getByTestId('stage.nav-stub'));

    expect(mockNavigate).toHaveBeenCalledWith('Stage');
  });
});

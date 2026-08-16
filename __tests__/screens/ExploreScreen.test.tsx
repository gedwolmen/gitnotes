import React from 'react';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockGetBranches = jest.fn();

let mockTreeBranch: string | undefined;
let mockTreeOnFilePress: ((node: unknown) => void) | undefined;

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
  useIsFocused: () => true,
}));

jest.mock('@react-navigation/native-stack', () => ({}));

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
      accent: '#8b5cf6',
    },
    isDark: false,
  }),
}));

jest.mock('../../src/contexts/RepoContext', () => ({
  useRepos: () => ({
    repositories: [
      { id: '1', name: 'notes', path: 'owner/repo', branch: 'main', provider: 'github' },
    ],
    refreshRepos: jest.fn(async () => undefined),
  }),
}));

jest.mock('../../src/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    isCycleHeld: jest.fn(() => false),
    isPushActive: jest.fn(() => false),
  },
}));

jest.mock('../../src/stores/gitOperationStore', () => ({
  useGitOperationStore: (selector: (s: { ops: Record<string, unknown> }) => unknown) =>
    selector({ ops: {} }),
  hasActivePull: jest.fn(() => false),
}));

jest.mock('../../src/services/GitService', () => ({
  GitService: { getBranches: (...args: unknown[]) => mockGetBranches(...args) },
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/components/RepoFileTree', () => ({
  __esModule: true,
  default: (props: { branch?: string; onFilePress?: (node: unknown) => void }) => {
    mockTreeBranch = props.branch;
    mockTreeOnFilePress = props.onFilePress;
    return null;
  },
}));

jest.mock('../../src/components/ui', () => {
  const { View, Text, Pressable } = require('react-native');
  return {
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
    Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View testID="branch-picker-modal">{children}</View> : null,
    ScreenHeader: ({
      title,
      onBack,
      actions,
    }: {
      title: string;
      onBack?: () => void;
      actions?: React.ReactNode;
    }) => (
      <View testID="screen-header">
        {onBack ? (
          <Pressable testID="explore.button.back" onPress={onBack}>
            <Text>back</Text>
          </Pressable>
        ) : null}
        <Text>{title}</Text>
        {actions}
      </View>
    ),
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
  };
});

jest.mock('../../src/components/ui/SafeAreaView', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('../../src/components/ui/OfflineBanner', () => ({ OfflineBanner: () => null }));

jest.mock('../../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({ testID }: { testID?: string }) => <TextInput testID={testID} />;
});

import ExploreScreen from '../../src/screens/ExploreScreen';

async function openFileTree(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByTestId('explore.button.select-repo'));
  fireEvent.press(screen.getByTestId('explore.button.open-file-tree'));
}

describe('ExploreScreen branch picker', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGetBranches.mockClear();
    mockGetBranches.mockResolvedValue([
      { name: 'main', isCurrent: true },
      { name: 'develop', isCurrent: false },
    ]);
    mockTreeBranch = undefined;
    mockTreeOnFilePress = undefined;
  });

  it('shows the current branch in the branch chip', async () => {
    const screen = render(<ExploreScreen />);
    await openFileTree(screen);

    const chip = screen.getByTestId('explore.button.branch-picker');
    expect(within(chip).getByText('main')).toBeTruthy();
    expect(mockTreeBranch).toBe('main');
  });

  it('opens the branch list on tap, loading via GitService.getBranches', async () => {
    const screen = render(<ExploreScreen />);
    await openFileTree(screen);

    fireEvent.press(screen.getByTestId('explore.button.branch-picker'));

    await waitFor(() => expect(screen.getByTestId('branch-picker-modal')).toBeTruthy());
    expect(screen.getByTestId('explore.branch.option.develop')).toBeTruthy();
    expect(mockGetBranches).toHaveBeenCalledWith('owner/repo', 'github');
  });

  it('selects a branch and passes it to RepoFileTree', async () => {
    const screen = render(<ExploreScreen />);
    await openFileTree(screen);

    fireEvent.press(screen.getByTestId('explore.button.branch-picker'));
    await waitFor(() => expect(screen.getByTestId('explore.branch.option.develop')).toBeTruthy());

    fireEvent.press(screen.getByTestId('explore.branch.option.develop'));

    expect(mockTreeBranch).toBe('develop');
    const chip = screen.getByTestId('explore.button.branch-picker');
    expect(within(chip).getByText('develop')).toBeTruthy();
  });

  it('passes the selected branch in viewer navigation params', async () => {
    const screen = render(<ExploreScreen />);
    await openFileTree(screen);

    fireEvent.press(screen.getByTestId('explore.button.branch-picker'));
    await waitFor(() => expect(screen.getByTestId('explore.branch.option.develop')).toBeTruthy());
    fireEvent.press(screen.getByTestId('explore.branch.option.develop'));

    expect(mockTreeOnFilePress).toBeDefined();
    mockTreeOnFilePress!({ name: 'notes.md', path: 'notes.md', size: 10 });

    expect(mockNavigate).toHaveBeenCalledWith('FileViewer', {
      owner: 'owner',
      repo: 'repo',
      branch: 'develop',
      path: 'notes.md',
      title: 'notes.md',
      size: 10,
    });
  });

  it('falls back to the current branch label when getBranches fails', async () => {
    mockGetBranches.mockRejectedValueOnce(new Error('boom'));
    const screen = render(<ExploreScreen />);
    await openFileTree(screen);

    fireEvent.press(screen.getByTestId('explore.button.branch-picker'));

    await waitFor(() => expect(screen.getByTestId('branch-picker-modal')).toBeTruthy());
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getAllByText('main').length).toBeGreaterThanOrEqual(1);
  });
});

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRepositories: { id: string; name: string; path: string }[] = [];
const mockLoadRepos = jest.fn();
const mockLastUsedGet = jest.fn();
const mockLastUsedSet = jest.fn();
const mockUseFocusEffect = jest.fn();

jest.mock('expo-file-system', () => {
  class FakeDirectory {
    name = '';
    list = () => [];
  }
  class FakeFile {
    name = '';
  }
  return { Directory: FakeDirectory, File: FakeFile };
});

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
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => mockUseFocusEffect(cb),
  useIsFocused: () => true,
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      surfaceSecondary: '#eaeaea',
      primary: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
      accent: '#8b5cf6',
      success: '#10b981',
    },
    isDark: false,
  }),
  useTokens: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      surfaceSecondary: '#eaeaea',
      primary: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
      accent: '#8b5cf6',
      success: '#10b981',
    },
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24 },
    radii: { sm: 4, md: 8, lg: 12, xl: 16, pill: 999 },
  }),
}));

jest.mock('../../src/stores/repoStore', () => ({
  useRepoStore: (selector: (s: {
    repositories: { id: string; name: string; path: string }[];
    isLoading: boolean;
    loadRepos: () => Promise<void>;
  }) => unknown) => {
    const state = {
      repositories: mockRepositories,
      isLoading: false,
      loadRepos: mockLoadRepos,
    };
    return selector(state);
  },
}));

jest.mock('../../src/services/LastUsedRepoService', () => ({
  LastUsedRepoService: {
    get: (...args: unknown[]) => mockLastUsedGet(...args),
    set: (...args: unknown[]) => mockLastUsedSet(...args),
    clear: jest.fn(),
  },
}));

jest.mock('../../src/hooks/useGitRepoStatus', () => ({
  useGitRepoStatus: () => ({
    status: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: {
    workingTreeUri: ({ repoPath }: { repoPath: string }) => repoPath,
    cloneExclusive: jest.fn(),
    removeRepo: jest.fn(),
  },
}));

jest.mock('../../src/services/git/engine/GitEngine', () => ({
  statuses: jest.fn(() => Promise.resolve<string[]>([])),
}));

jest.mock('../../src/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    isCycleHeld: jest.fn(() => false),
    isPushActive: jest.fn(() => false),
  },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: {
    getToken: jest.fn(() => Promise.resolve(null)),
  },
}));

jest.mock('../../src/services/git/recovery', () => ({
  pushWithForce: jest.fn(),
}));

jest.mock('../../src/components/ui/SectionTabs', () => {
  const { View } = require('react-native');
  return {
    SectionTabs: ({ testID }: { testID?: string }) => <View testID={testID} />,
  };
});

jest.mock('../../src/components/git/FloatingGitButton', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: ({ testID }: { testID?: string }) => <View testID={testID} /> };
});

jest.mock('../../src/components/explore/FilesSection', () => {
  const { View, Text } = require('react-native');
  return {
    FilesSection: ({ repo }: { repo: { name: string } }) => (
      <View testID="files-section">
        <Text testID="files-section.repo-name">{repo.name}</Text>
      </View>
    ),
  };
});

jest.mock('../../src/components/explore/ChangesSection', () => {
  const { View } = require('react-native');
  return { ChangesSection: () => <View /> };
});
jest.mock('../../src/components/explore/StagingSection', () => {
  const { View } = require('react-native');
  return { StagingSection: () => <View /> };
});
jest.mock('../../src/components/explore/CommitsSection', () => {
  const { View } = require('react-native');
  return { CommitsSection: () => <View /> };
});
jest.mock('../../src/components/explore/BranchesSection', () => {
  const { View } = require('react-native');
  return { BranchesSection: () => <View /> };
});
jest.mock('../../src/components/explore/RemotesSection', () => {
  const { View } = require('react-native');
  return { RemotesSection: () => <View /> };
});
jest.mock('../../src/components/explore/ConflictsSection', () => {
  const { View } = require('react-native');
  return { ConflictsSection: () => <View /> };
});
jest.mock('../../src/components/explore/PullRequestsSection', () => {
  const { View } = require('react-native');
  return { PullRequestsSection: () => <View /> };
});
jest.mock('../../src/components/explore/IssuesSection', () => {
  const { View } = require('react-native');
  return { IssuesSection: () => <View /> };
});
jest.mock('../../src/components/explore/RepoInfoSection', () => {
  const { View } = require('react-native');
  return { RepoInfoSection: () => <View /> };
});

jest.mock('../../src/stores/gitOperationStore', () => ({
  useGitOperationStore: (selector: (s: { ops: Record<string, unknown> }) => unknown) =>
    selector({ ops: {} }),
  hasActivePull: jest.fn(() => false),
}));

import ExploreScreen from '../../src/screens/ExploreScreen';

function setRepositories(repos: { id: string; name: string; path: string }[]) {
  mockRepositories.length = 0;
  mockRepositories.push(...repos);
}

describe('ExploreScreen — multi-repo picker (S1, S2, S3, S4)', () => {
  beforeEach(() => {
    mockRepositories.length = 0;
    mockLoadRepos.mockClear();
    mockLastUsedGet.mockReset();
    mockLastUsedSet.mockReset();
    mockLastUsedGet.mockResolvedValue(null);
  });

  // S1 — happy path: switch between two repos
  it('S1: shows the first repo by default and lets the user switch via the bottom-sheet picker', async () => {
    setRepositories([
      { id: 'r-notes', name: 'notes', path: 'octocat/notes' },
      { id: 'r-scratch', name: 'scratch', path: 'octocat/scratch' },
    ]);
    const screen = render(<ExploreScreen />);

    // S3 (auto-sync): first repo is shown by default
    expect(screen.getByTestId('files-section.repo-name').props.children).toBe('notes');
    expect(screen.getByTestId('explore.header.repo-name').props.children).toBe('notes');

    // S1: tap the tappable header to open the picker
    fireEvent.press(screen.getByTestId('explore.header.repo-picker'));

    // The bottom sheet should now be visible with both items
    await waitFor(() => {
      expect(screen.getByTestId('explore.repo-picker.modal')).toBeTruthy();
    });
    expect(screen.getByTestId('explore.repo-picker.item-r-scratch')).toBeTruthy();
    expect(screen.getByTestId('explore.repo-picker.item-r-notes')).toBeTruthy();

    // Tap the second repo
    fireEvent.press(screen.getByTestId('explore.repo-picker.item-r-scratch'));

    // Picker should close and the active repo should switch
    await waitFor(() => {
      expect(screen.queryByTestId('explore.repo-picker.modal')).toBeNull();
    });
    expect(screen.getByTestId('explore.header.repo-name').props.children).toBe('scratch');
    expect(screen.getByTestId('files-section.repo-name').props.children).toBe('scratch');

    // S4: persistence — picking the repo calls LastUsedRepoService.set
    expect(mockLastUsedSet).toHaveBeenCalledWith('octocat/scratch');
  });

  // S2 — edge: single repo → no picker affordance
  it('S2: with only one repo, the header title is not a switcher (no chevron, no picker on tap)', () => {
    setRepositories([
      { id: 'r-only', name: 'only', path: 'octocat/only' },
    ]);
    const screen = render(<ExploreScreen />);

    // Header shows the only repo
    expect(screen.getByTestId('explore.header.repo-name').props.children).toBe('only');

    // The picker trigger element should NOT exist (no affordance for single repo)
    expect(screen.queryByTestId('explore.header.repo-picker')).toBeNull();

    // Tapping the header should NOT open the bottom sheet
    fireEvent.press(screen.getByTestId('explore.header.repo-name'));
    expect(screen.queryByTestId('explore.repo-picker.modal')).toBeNull();
  });

  // S3 — auto-sync first repo on mount (covered partially by S1; this is the explicit case)
  it('S3: with no last-used stored, the first repo in the list is auto-selected', () => {
    setRepositories([
      { id: 'r-a', name: 'alpha', path: 'octocat/alpha' },
      { id: 'r-b', name: 'beta', path: 'octocat/beta' },
    ]);
    mockLastUsedGet.mockResolvedValue(null);

    const screen = render(<ExploreScreen />);

    expect(screen.getByTestId('explore.header.repo-name').props.children).toBe('alpha');
    expect(screen.getByTestId('files-section.repo-name').props.children).toBe('alpha');
  });

  // S4 — persistence: last-used is honored on mount when it points to a still-existing repo
  it('S4: pre-seeds selection from LastUsedRepoService when the path still exists', async () => {
    mockLastUsedGet.mockResolvedValue('octocat/beta');
    setRepositories([
      { id: 'r-a', name: 'alpha', path: 'octocat/alpha' },
      { id: 'r-b', name: 'beta', path: 'octocat/beta' },
    ]);

    const screen = render(<ExploreScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('explore.header.repo-name').props.children).toBe('beta');
    });
    expect(screen.getByTestId('files-section.repo-name').props.children).toBe('beta');
  });
});
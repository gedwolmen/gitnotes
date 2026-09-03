import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const mockRepositories: { id: string; name: string; path: string }[] = [];
const mockGoBack = jest.fn();
const mockLog = jest.fn();
const mockCommitDiff = jest.fn();
const mockCheckoutCommit = jest.fn();
const mockResetSoft = jest.fn();
const mockRevertCommit = jest.fn();

const routeParams = { repoId: 'github:1788402472029', commitId: 'f813d0a3fullhash' };

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

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: routeParams }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTokens: () => ({
    colors: {
      background: '#fff',
      card: '#f8f8f8',
      elevated: '#e8e8e8',
      surfaceSecondary: '#eaeaea',
      border: '#ddd',
      text: '#111',
      textSecondary: '#666',
      accent: '#8b5cf6',
      success: '#10b981',
      error: '#dc2626',
    },
  }),
}));

jest.mock('@/stores/repoStore', () => ({
  useRepoStore: (selector: (s: { repositories: typeof mockRepositories }) => unknown) =>
    selector({ repositories: mockRepositories }),
}));

jest.mock('@/hooks/useAccounts', () => ({
  useActiveAccount: () => ({
    activeAccount: { id: 'acc-1', name: 'Ada', email: 'ada@example.com', provider: 'github' },
    accounts: [],
  }),
}));

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    workingTreeUri: ({ repoPath }: { repoPath: string }) => `/clones/${repoPath}`,
  },
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  __esModule: true,
  log: (...args: unknown[]) => mockLog(...args),
  commitDiff: (...args: unknown[]) => mockCommitDiff(...args),
  checkoutCommit: (...args: unknown[]) => mockCheckoutCommit(...args),
  resetSoft: (...args: unknown[]) => mockResetSoft(...args),
  revertCommit: (...args: unknown[]) => mockRevertCommit(...args),
}));

jest.mock('@/components/explore/DiffLineList', () => ({
  DiffLineList: () => null,
  previewLines: (lines: unknown[]) => lines,
}));

jest.mock('@/components/ui/Button', () => {
  const { Pressable: MockPressable, Text: MockText } = require('react-native');
  return {
    Button: ({ children, onPress, testID, disabled }: { children: React.ReactNode; onPress?: () => void; testID?: string; disabled?: boolean }) => (
      <MockPressable testID={testID} onPress={onPress} disabled={disabled}>{children}</MockPressable>
    ),
    ButtonText: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText>,
  };
});

jest.mock('@/components/ui/text', () => {
  const { Text: MockText } = require('react-native');
  return {
    Text: MockText,
    ButtonText: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText>,
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

import ExploreCommitScreen from '../../src/screens/ExploreCommitScreen';

const COMMIT = {
  id: 'f813d0a3fullhash',
  shortId: 'f813d0a',
  message: 'feat: add notes',
  summary: 'feat: add notes',
  authorName: 'Ada Lovelace',
  authorEmail: 'ada@example.com',
  authorTime: 1_700_000_000,
  parentCount: 1,
  author: { name: 'Ada Lovelace', email: 'ada@example.com' },
  timestamp: 1_700_000_000,
};

const FILE_DIFF = {
  path: 'notes.md',
  oldPath: 'notes.md',
  newPath: 'notes.md',
  hunks: [],
  added: 3,
  deleted: 1,
  isBinary: false,
  lines: [
    { index: 0, origin: 'Addition', type: 'add', oldLineno: 0, newLineno: 1, content: 'hello' },
  ],
};

function setRepositories(repos: { id: string; name: string; path: string }[]) {
  mockRepositories.length = 0;
  mockRepositories.push(...repos);
}

describe('ExploreCommitScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setRepositories([]);
  });

  it('shows a fallback when the repo is missing and never touches the engine', () => {
    const screen = render(<ExploreCommitScreen />);
    expect(screen.getByTestId('explore-commit.missing-repo')).toBeTruthy();
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockCommitDiff).not.toHaveBeenCalled();
  });

  it('reads the commit and its diff from the cloned working tree', async () => {
    setRepositories([{ id: routeParams.repoId, name: 'notes', path: 'owner/notes' }]);
    mockLog.mockResolvedValue([COMMIT]);
    mockCommitDiff.mockResolvedValue([FILE_DIFF]);

    const screen = render(<ExploreCommitScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('explore-commit.summary')).toBeTruthy();
    });

    expect(mockLog).toHaveBeenCalledWith('/clones/owner/notes', 500);
    expect(mockCommitDiff).toHaveBeenCalledWith('/clones/owner/notes', routeParams.commitId);
    expect(screen.getByTestId('explore-commit.shortid').props.children).toBe('f813d0a');
    expect(screen.getByTestId('explore-commit.summary').props.children).toBe('feat: add notes');
    expect(screen.getByTestId('explore-commit.diff.notes.md')).toBeTruthy();
    expect(screen.getByTestId('explore-commit.checkout')).toBeTruthy();
    expect(screen.getByTestId('explore-commit.reset-soft')).toBeTruthy();
    expect(screen.getByTestId('explore-commit.revert')).toBeTruthy();
  });

  it('surfaces an error when the commit is not in local history', async () => {
    setRepositories([{ id: routeParams.repoId, name: 'notes', path: 'owner/notes' }]);
    mockLog.mockResolvedValue([]);
    mockCommitDiff.mockResolvedValue([]);

    const screen = render(<ExploreCommitScreen />);

    await waitFor(() => {
      expect(screen.getByText('Commit not found in local history.')).toBeTruthy();
    });
  });
});

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useRoute, useNavigation } from '@react-navigation/native';

import ConflictResolveScreen from '@/screens/ConflictResolveScreen';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { GitRepository } from '@/services/GitService';

let mockRepositories: GitRepository[] = [];

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
  useRoute: jest.fn(),
}));

jest.mock('@/stores/repoStore', () => ({
  useRepoStore: (selector: (state: { repositories: GitRepository[] }) => unknown) =>
    selector({ repositories: mockRepositories }),
}));

jest.mock('@/stores/gitButtonActionStore', () => ({
  useGitButtonActionStore: (selector: (state: { setPending: jest.Mock }) => unknown) =>
    selector({ setPending: jest.fn() }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTokens: () => ({
    colors: {
      background: '#fff',
      border: '#ddd',
      text: '#111',
      textSecondary: '#666',
      accent: '#00f',
      card: '#eee',
      error: '#f00',
      surface: '#fff',
    },
    type: { xs: 12, sm: 14, md: 16 },
  }),
  useTheme: () => ({ style: {} }),
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('@/components/ui/Button', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({ children, onPress, disabled, testID }: {
      children: unknown;
      onPress?: () => void;
      disabled?: boolean;
      testID?: string;
    }) => React.createElement(Pressable, { onPress, disabled, testID }, children),
    ButtonText: ({ children }: { children: unknown }) => React.createElement(Text, null, children),
  };
});

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: { workingTreeUri: jest.fn(() => 'file:///repo') },
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  getConflictBlobs: jest.fn(),
  markConflictResolved: jest.fn(),
}));

jest.mock('@/services/git/conflictResolution', () => ({
  getConflictChoiceContent: jest.fn((blobs: { ours: string; theirs: string }, choice: string) => {
    if (choice === 'ours') return blobs.ours;
    if (choice === 'theirs') return blobs.theirs;
    if (choice === 'both') return `${blobs.ours}\n${blobs.theirs}`;
    return `<<<<<<< ours\n${blobs.ours}\n=======\n${blobs.theirs}\n>>>>>>> theirs\n`;
  }),
  resolveConflictAndSync: jest.fn(),
}));

describe('ConflictResolveScreen', () => {
  beforeEach(() => {
    mockRepositories = [];
    jest.clearAllMocks();
  });

  it('keeps the resolver body visible when the repository is unavailable', () => {
    (useNavigation as jest.Mock).mockReturnValue({ goBack: jest.fn(), navigate: jest.fn() });
    (useRoute as jest.Mock).mockReturnValue({ params: { repoId: 'repo-1', path: 'notes/hi2.md' } });

    const screen = render(<ConflictResolveScreen />);

    expect(screen.getByTestId('conflict-resolve.screen').props.style).toEqual(
      expect.objectContaining({ flex: 1 }),
    );
    expect(screen.getByText('Repository not found.')).toBeTruthy();
  });

  it('offers ours, theirs, both, and full edit choices', async () => {
    mockRepositories = [{ id: 'repo-1', path: 'owner/repo', name: 'repo', branch: 'main' }];
    (GitEngine.getConflictBlobs as jest.Mock).mockResolvedValue({
      ours: 'local',
      theirs: 'remote',
      base: 'common',
    });
    (useNavigation as jest.Mock).mockReturnValue({ goBack: jest.fn(), navigate: jest.fn() });
    (useRoute as jest.Mock).mockReturnValue({ params: { repoId: 'repo-1', path: 'notes/hi2.md' } });

    const screen = render(<ConflictResolveScreen />);

    await waitFor(() => expect(screen.getByTestId('conflict-resolve.accept-ours')).toBeTruthy());
    fireEvent.press(screen.getByTestId('conflict-resolve.accept-both'));

    expect(screen.getByTestId('conflict-resolve.accept-theirs')).toBeTruthy();
    expect(screen.getByTestId('conflict-resolve.full-edit')).toBeTruthy();
    expect(screen.getByTestId('conflict-resolve.editor').props.value).toBe('local\nremote');
  });
});

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-file-system', () => ({}));

const TEST_FILES = [
  'readme.md',
  'test.txt',
  'index.ts',
  'util.ts',
  'guide.txt',
  'screenshot.jpg',
  'logo.png',
  'archive.tar.gz',
  'icon.woff2',
  'Makefile',
  'package.json',
];

jest.mock('@/components/explore/exploreShared', () => {
  const actual = jest.requireActual('@/components/explore/exploreShared');
  return {
    ...actual,
    walkWorkingTree: jest.fn(() => ({ files: TEST_FILES, truncated: false })),
  };
});

jest.mock('@/services/git/engine/GitEngine', () => {
  const actual = jest.requireActual('@/services/git/engine/GitEngine');
  return { ...actual, statuses: jest.fn(), stage: jest.fn() };
});

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: { isCloned: jest.fn() },
}));

jest.mock('@/services/GitHubService', () => {
  const mockGetTreeRecursiveOrThrow = jest.fn();
  return {
    getTreeRecursiveOrThrow: mockGetTreeRecursiveOrThrow,
    GitHubService: { getTreeRecursiveOrThrow: mockGetTreeRecursiveOrThrow },
  };
});

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: jest.fn((cb: () => void) => cb()),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTokens: () => ({
    colors: {
      background: '#ffffff', card: '#f0f0f0', border: '#cccccc',
      text: '#000000', textSecondary: '#666666', accent: '#007AFF',
      success: '#34C759', error: '#FF3B30', warning: '#FF9500',
      surface: '#e5e5ea', surfaceSecondary: '#e5e5ea',
    },
  }),
}));

import { FilesSection } from '@/components/explore/FilesSection';
import * as GitEngine from '@/services/git/engine/GitEngine';
import { GitFsService } from '@/services/git/GitFsService';
import { GitHubService } from '@/services/GitHubService';
import { isBinaryPath } from '@/components/explore/exploreShared';

const mockRepo = {
  id: 'test-repo-id', path: 'owner/test-repo', name: 'test-repo',
  localPath: '/mock/repos/test-repo', branch: 'main',
};

describe('FilesSection row navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitFsService.isCloned as jest.Mock).mockResolvedValue(true);
    (GitEngine.statuses as jest.Mock).mockResolvedValue([]);
  });

  describe('non-binary file rows', () => {
    const cases = [
      { path: 'readme.md', desc: 'markdown' },
      { path: 'index.ts', desc: 'typescript' },
      { path: 'guide.txt', desc: 'text' },
      { path: 'Makefile', desc: 'extensionless' },
      { path: 'package.json', desc: 'json' },
    ];

    it.each(cases)('navigates to ExploreFile for $desc ($path)', async ({ path }) => {
      expect(isBinaryPath(path)).toBe(false);
      const { getByTestId } = render(
        <FilesSection repo={mockRepo} active={true} onChanged={jest.fn()} status={null} />
      );
      await waitFor(() => expect(getByTestId(`explore.file.${path}`)).toBeTruthy());
      fireEvent.press(getByTestId(`explore.file.${path}`));
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('ExploreFile', { repoId: mockRepo.id, path });
    });
  });

  describe('binary file rows', () => {
    const cases = [
      { path: 'screenshot.jpg', desc: 'JPEG' },
      { path: 'logo.png', desc: 'PNG' },
      { path: 'archive.tar.gz', desc: 'archive' },
      { path: 'icon.woff2', desc: 'font' },
    ];

    it.each(cases)('navigates to ExploreFile for $desc ($path) with binary badge', async ({ path }) => {
      expect(isBinaryPath(path)).toBe(true);
      const { getByTestId, getAllByText } = render(
        <FilesSection repo={mockRepo} active={true} onChanged={jest.fn()} status={null} />
      );
      await waitFor(() => expect(getByTestId(`explore.file.${path}`)).toBeTruthy());
      const badges = getAllByText('binary');
      expect(badges.length).toBeGreaterThan(0);
      fireEvent.press(getByTestId(`explore.file.${path}`));
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('ExploreFile', { repoId: mockRepo.id, path });
    });
  });

  describe('no mutation on row tap', () => {
    it('does not call GitHubService on file row tap', async () => {
      const { getByTestId } = render(
        <FilesSection repo={mockRepo} active={true} onChanged={jest.fn()} status={null} />
      );
      await waitFor(() => expect(getByTestId('explore.file.readme.md')).toBeTruthy());
      fireEvent.press(getByTestId('explore.file.readme.md'));
      expect(GitHubService.getTreeRecursiveOrThrow).not.toHaveBeenCalled();
    });

    it('does not call GitEngine.stage on file row tap', async () => {
      const { getByTestId } = render(
        <FilesSection repo={mockRepo} active={true} onChanged={jest.fn()} status={null} />
      );
      await waitFor(() => expect(getByTestId('explore.file.readme.md')).toBeTruthy());
      fireEvent.press(getByTestId('explore.file.readme.md'));
      expect(GitEngine.stage).not.toHaveBeenCalled();
    });
  });

  describe('directory rows', () => {
    it('toggling a directory does not navigate to ExploreFile', async () => {
      const { getByTestId } = render(
        <FilesSection repo={mockRepo} active={true} onChanged={jest.fn()} status={null} />
      );
      await waitFor(() => expect(getByTestId('explore.file.readme.md')).toBeTruthy());
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});

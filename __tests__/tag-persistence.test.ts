jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  default: {},
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    updateFile: jest.fn(),
    getSavedRepositories: jest.fn(),
    getTreeRecursive: jest.fn(),
    getFileContent: jest.fn(),
    getRepoContents: jest.fn(async () => []),
  },
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
    getAllNotes: jest.fn(),
    createNote: jest.fn(),
    saveAllNotes: jest.fn(),
  },
}));

import { canPersistNoteTags } from '../src/utils/noteTagSupport';
import { syncNoteToGitHub } from '../src/services/NoteGitHubSyncService';
import { pullFromSingleRepo } from '../src/services/RepoPullService';
import { GitHubService } from '../src/services/GitHubService';
import { StorageService } from '../src/services/StorageService';

describe('tag persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
  });

  test('syncs markdown tags into frontmatter before upload', async () => {
    (GitHubService.updateFile as jest.Mock).mockResolvedValue({ ok: true });

    await syncNoteToGitHub({
      repo: 'org/repo',
      branch: 'main',
      title: 'My Note',
      content: 'hello world',
      format: 'markdown',
      tags: ['alpha', 'beta'],
    });

    expect(GitHubService.updateFile).toHaveBeenCalledWith(
      'org',
      'repo',
      'notes/my-note.md',
      expect.stringContaining('tags: [alpha, beta]'),
      'Create note: My Note',
      'main',
      undefined
    );
  });

  test('restores tags from repo content on refresh', async () => {
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'org/repo', branch: 'main' },
    ]);
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([]);
    (GitHubService.getTreeRecursive as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'notes/my-note.md' },
    ]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValue(
      '---\ntags: [alpha, beta]\n---\n\nhello world'
    );

    await pullFromSingleRepo('org/repo');

    expect(StorageService.saveAllNotes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'my note',
          tags: ['alpha', 'beta'],
          filePath: 'notes/my-note.md',
          repo: 'org/repo',
        }),
      ])
    );
  });

  test('hides tag input for unsupported formats', () => {
    expect(canPersistNoteTags('markdown')).toBe(true);
    expect(canPersistNoteTags('org')).toBe(true);
    expect(canPersistNoteTags('neorg')).toBe(true);
    expect(canPersistNoteTags('json')).toBe(false);
    expect(canPersistNoteTags('pdf')).toBe(false);
    expect(canPersistNoteTags('txt')).toBe(false);
  });
});

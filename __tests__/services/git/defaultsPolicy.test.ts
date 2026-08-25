jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (key in store ? store[key] : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
      __reset: () => {
        store = {};
      },
    },
  };
});

jest.mock('../../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
  },
}));

jest.mock('../../../src/stores/repoStore', () => ({
  useRepoStore: {
    getState: jest.fn(),
  },
}));

jest.mock('../../../src/services/git/branchResolver', () => ({
  resolveBranch: jest.fn(),
}));

import { StorageService } from '../../../src/services/StorageService';
import { useRepoStore } from '../../../src/stores/repoStore';
import { resolveBranch } from '../../../src/services/git/branchResolver';
import {
  resolveDefaultRepo,
  resolveDefaultBranch,
  resolveDefaultFolder,
} from '../../../src/services/git/defaultsPolicy';

describe('defaultsPolicy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── resolveDefaultRepo ────────────────────────────────────────────────────

  describe('resolveDefaultRepo', () => {
    test('returns the first saved repository path', async () => {
      const repos = [
        { id: 'r1', name: 'notes', path: 'owner/notes' },
        { id: 'r2', name: 'wiki', path: 'owner/wiki' },
      ];
      jest.mocked(StorageService.getSavedRepositories).mockResolvedValue(repos);

      const result = await resolveDefaultRepo();
      expect(result).toBe('owner/notes');
      expect(StorageService.getSavedRepositories).toHaveBeenCalledTimes(1);
    });

    test('throws when no repositories are saved', async () => {
      jest.mocked(StorageService.getSavedRepositories).mockResolvedValue([]);

      await expect(resolveDefaultRepo()).rejects.toThrow('No saved repositories found');
    });
  });

  // ─── resolveDefaultBranch ────────────────────────────────────────────────────

  describe('resolveDefaultBranch', () => {
    test('returns "main" when no branch is stored for the repo', async () => {
      jest.mocked(useRepoStore.getState).mockReturnValue({
        repositories: [{ id: 'r1', name: 'notes', path: 'owner/notes' }],
      });

      const result = await resolveDefaultBranch('owner/notes');
      expect(result).toBe('main');
      expect(resolveBranch).not.toHaveBeenCalled();
    });

    test('calls resolveBranch with stored branch as hint when branch is stored', async () => {
      jest.mocked(useRepoStore.getState).mockReturnValue({
        repositories: [{ id: 'r1', name: 'notes', path: 'owner/notes', branch: 'develop' }],
      });
      jest.mocked(resolveBranch).mockResolvedValue('develop');

      const result = await resolveDefaultBranch('owner/notes');
      expect(result).toBe('develop');
      expect(resolveBranch).toHaveBeenCalledWith('owner/notes', 'develop');
    });

    test('returns "main" when repo is not found in store', async () => {
      jest.mocked(useRepoStore.getState).mockReturnValue({ repositories: [] });

      const result = await resolveDefaultBranch('owner/nonexistent');
      expect(result).toBe('main');
      expect(resolveBranch).not.toHaveBeenCalled();
    });

    test('returns "main" directly when stored branch is undefined (falsy)', async () => {
      // repo with no branch key at all — repo?.branch is undefined
      jest.mocked(useRepoStore.getState).mockReturnValue({
        repositories: [{ id: 'r1', name: 'notes', path: 'owner/notes' }],
      });

      const result = await resolveDefaultBranch('owner/notes');
      expect(result).toBe('main');
      expect(resolveBranch).not.toHaveBeenCalled();
    });
  });

  // ─── resolveDefaultFolder ───────────────────────────────────────────────────

  describe('resolveDefaultFolder', () => {
    test('returns "notes/" for note', () => {
      expect(resolveDefaultFolder('note')).toBe('notes/');
    });

    test('returns "canvases/" for canvas', () => {
      expect(resolveDefaultFolder('canvas')).toBe('canvases/');
    });

    test('returns "todos/" for todo', () => {
      expect(resolveDefaultFolder('todo')).toBe('todos/');
    });

    test('returns "templates/" for template', () => {
      expect(resolveDefaultFolder('template')).toBe('templates/');
    });
  });
});

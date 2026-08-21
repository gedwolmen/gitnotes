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
      __dump: () => ({ ...store }),
      __setRaw: (key: string, value: string) => {
        store[key] = value;
      },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThoughtDumpRepoPreferenceService } from '../../src/services/ThoughtDumpRepoPreferenceService';

const KEY = '@gitnotes:thought_dump_repo';

const store = AsyncStorage as unknown as {
  __reset: () => void;
  __dump: () => Record<string, string>;
  __setRaw: (key: string, value: string) => void;
};

beforeEach(() => {
  store.__reset();
});

describe('ThoughtDumpRepoPreferenceService', () => {
  describe('get', () => {
    it('returns null when no preference is stored', async () => {
      expect(await ThoughtDumpRepoPreferenceService.get()).toBeNull();
    });

    it('returns the target after a set round-trip', async () => {
      await ThoughtDumpRepoPreferenceService.set('org/repo', 'main');
      expect(await ThoughtDumpRepoPreferenceService.get()).toEqual({
        repoPath: 'org/repo',
        branch: 'main',
      });
    });

    it('round-trips a repo without a branch', async () => {
      await ThoughtDumpRepoPreferenceService.set('org/repo');
      expect(await ThoughtDumpRepoPreferenceService.get()).toEqual({
        repoPath: 'org/repo',
      });
    });

    it('returns null for corrupt JSON', async () => {
      store.__setRaw(KEY, '{not valid json');
      expect(await ThoughtDumpRepoPreferenceService.get()).toBeNull();
    });

    it('returns null when the stored value has no repoPath', async () => {
      store.__setRaw(KEY, JSON.stringify({ branch: 'main' }));
      expect(await ThoughtDumpRepoPreferenceService.get()).toBeNull();
    });

    it('returns null when repoPath is an empty string', async () => {
      store.__setRaw(KEY, JSON.stringify({ repoPath: '', branch: 'main' }));
      expect(await ThoughtDumpRepoPreferenceService.get()).toBeNull();
    });
  });

  describe('set', () => {
    it('stores JSON with repoPath and branch', async () => {
      await ThoughtDumpRepoPreferenceService.set('org/repo', 'feature');
      expect(store.__dump()[KEY]).toBe(JSON.stringify({ repoPath: 'org/repo', branch: 'feature' }));
    });

    it('stores JSON without branch when omitted', async () => {
      await ThoughtDumpRepoPreferenceService.set('org/repo');
      expect(store.__dump()[KEY]).toBe(JSON.stringify({ repoPath: 'org/repo' }));
    });
  });

  describe('clear', () => {
    it('removes the stored preference', async () => {
      await ThoughtDumpRepoPreferenceService.set('org/repo', 'main');
      await ThoughtDumpRepoPreferenceService.clear();
      expect(store.__dump()[KEY]).toBeUndefined();
      expect(await ThoughtDumpRepoPreferenceService.get()).toBeNull();
    });
  });
});

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@gitnotes:thought_dump_repo';

export interface ThoughtDumpTarget {
  repoPath: string;
  branch?: string;
}

// Remembers the repo the user last dumped a thought into, so the next
// thought dump can pre-select that repo (and branch) instead of falling
// back to the first saved repository.
export class ThoughtDumpRepoPreferenceService {
  static async get(): Promise<ThoughtDumpTarget | null> {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (typeof parsed !== 'object' || parsed === null) return null;

    const target = parsed as ThoughtDumpTarget;
    if (typeof target.repoPath !== 'string' || target.repoPath.length === 0) {
      return null;
    }

    return {
      repoPath: target.repoPath,
      branch: typeof target.branch === 'string' ? target.branch : undefined,
    };
  }

  static async set(repoPath: string, branch?: string): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify({ repoPath, branch }));
  }

  static async clear(): Promise<void> {
    await AsyncStorage.removeItem(KEY);
  }
}

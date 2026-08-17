import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@gitnotes:last_used_repo';

// Tracks the most recently picked repository in any GitContextPicker. When
// the picker opens with no repo set, we pre-select this one (or the only
// repo, if the user has just one) so the common case takes zero taps.
export class LastUsedRepoService {
  static async get(): Promise<string | null> {
    return AsyncStorage.getItem(KEY);
  }

  static async set(repoPath: string): Promise<void> {
    await AsyncStorage.setItem(KEY, repoPath);
  }

  static async clear(): Promise<void> {
    await AsyncStorage.removeItem(KEY);
  }
}

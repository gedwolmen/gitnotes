import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@gitnotes:templates_repo';

export interface TemplateRepoPreference {
  repoPath: string; // canonical "owner/repo" — same shape as GitRepository.path
  branch: string;
}

export class TemplateRepoPreferenceService {
  static async get(): Promise<TemplateRepoPreference | null> {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as TemplateRepoPreference;
      if (!parsed?.repoPath || !parsed?.branch) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  static async set(pref: TemplateRepoPreference): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(pref));
  }

  static async clear(): Promise<void> {
    await AsyncStorage.removeItem(KEY);
  }
}

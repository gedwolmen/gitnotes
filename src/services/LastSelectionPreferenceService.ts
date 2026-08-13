import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = '@gitnotes:last_selection';
const LEGACY_KEY = '@gitnotes:last_used_repo';
const MIGRATION_FLAG_KEY = '@gitnotes:last_selection:migrated';

export type SelectionEntityType = 'note' | 'todo';

export interface LastSelectionShape {
  repo?: string;
  branch?: string;
  folder?: string;
}

export class LastSelectionPreferenceService {
  private static keyFor(entityType: SelectionEntityType): string {
    return `${KEY_PREFIX}:${entityType}`;
  }

  static async get(entityType: SelectionEntityType): Promise<LastSelectionShape> {
    const raw = await AsyncStorage.getItem(this.keyFor(entityType));
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return {
        repo: typeof parsed.repo === 'string' ? parsed.repo : undefined,
        branch: typeof parsed.branch === 'string' ? parsed.branch : undefined,
        folder: typeof parsed.folder === 'string' ? parsed.folder : undefined,
      };
    } catch {
      return {};
    }
  }

  static async set(entityType: SelectionEntityType, selections: LastSelectionShape): Promise<void> {
    await AsyncStorage.setItem(this.keyFor(entityType), JSON.stringify(selections));
  }

  static async clear(entityType: SelectionEntityType): Promise<void> {
    await AsyncStorage.removeItem(this.keyFor(entityType));
  }

  static async migrateFromLegacy(): Promise<void> {
    const migrated = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    if (migrated === 'true') return;
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const existingNote = await this.get('note');
      const existingTodo = await this.get('todo');
      if (!existingNote.repo) {
        await this.set('note', { ...existingNote, repo: legacy });
      }
      if (!existingTodo.repo) {
        await this.set('todo', { ...existingTodo, repo: legacy });
      }
    }
    await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
  }
}

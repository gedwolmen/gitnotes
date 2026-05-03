import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NoteFormat } from '../models/Note';

const DEFAULT_FORMAT_KEY = '@gitnotes:default_note_format';
const REMEMBER_FORMAT_KEY = '@gitnotes:remember_note_format';

export type EditableNoteFormat = Exclude<NoteFormat, 'pdf' | 'json'>;

export class NoteFormatPreferenceService {
  static async getDefaultFormat(): Promise<EditableNoteFormat | null> {
    const v = await AsyncStorage.getItem(DEFAULT_FORMAT_KEY);
    if (v === 'markdown' || v === 'org' || v === 'neorg') return v;
    return null;
  }

  static async getRememberPreference(): Promise<boolean> {
    return (await AsyncStorage.getItem(REMEMBER_FORMAT_KEY)) === 'true';
  }

  static async setDefaultFormat(format: EditableNoteFormat, remember: boolean): Promise<void> {
    await AsyncStorage.setItem(DEFAULT_FORMAT_KEY, format);
    await AsyncStorage.setItem(REMEMBER_FORMAT_KEY, remember ? 'true' : 'false');
  }

  static async clearDefaultFormat(): Promise<void> {
    await AsyncStorage.removeItem(DEFAULT_FORMAT_KEY);
    await AsyncStorage.removeItem(REMEMBER_FORMAT_KEY);
  }
}

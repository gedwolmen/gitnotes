import { LastSelectionPreferenceService } from '../../src/services/LastSelectionPreferenceService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const testStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => testStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { testStore[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete testStore[k]; }),
  },
}));

describe('LastSelectionPreferenceService', () => {
  beforeEach(() => {
    Object.keys(testStore).forEach((k) => delete testStore[k]);
    jest.clearAllMocks();
  });

  test('get returns empty shape when unset', async () => {
    expect(await LastSelectionPreferenceService.get('note')).toEqual({});
  });

  test('set and get round-trips for note', async () => {
    await LastSelectionPreferenceService.set('note', { repo: 'user/repo', branch: 'main', folder: '/notes' });
    expect(await LastSelectionPreferenceService.get('note')).toEqual({
      repo: 'user/repo',
      branch: 'main',
      folder: '/notes',
    });
  });

  test('set and get round-trips for todo (separate from note)', async () => {
    await LastSelectionPreferenceService.set('note', { repo: 'notes-repo' });
    await LastSelectionPreferenceService.set('todo', { repo: 'todo-repo' });
    expect(await LastSelectionPreferenceService.get('note')).toEqual({ repo: 'notes-repo' });
    expect(await LastSelectionPreferenceService.get('todo')).toEqual({ repo: 'todo-repo' });
  });

  test('get ignores malformed JSON', async () => {
    await (AsyncStorage as unknown as { setItem: (k: string, v: string) => Promise<void> }).setItem('@gitnotes:last_selection:note', 'not-json');
    expect(await LastSelectionPreferenceService.get('note')).toEqual({});
  });

  test('clear removes the key', async () => {
    await LastSelectionPreferenceService.set('note', { repo: 'user/repo' });
    await LastSelectionPreferenceService.clear('note');
    expect(await LastSelectionPreferenceService.get('note')).toEqual({});
  });

  test('migrateFromLegacy copies legacy repo to note and todo', async () => {
    await (AsyncStorage as unknown as { setItem: (k: string, v: string) => Promise<void> }).setItem('@gitnotes:last_used_repo', 'legacy/repo');
    await LastSelectionPreferenceService.migrateFromLegacy();
    expect(await LastSelectionPreferenceService.get('note')).toEqual({ repo: 'legacy/repo' });
    expect(await LastSelectionPreferenceService.get('todo')).toEqual({ repo: 'legacy/repo' });
  });

  test('migrateFromLegacy is idempotent', async () => {
    await (AsyncStorage as unknown as { setItem: (k: string, v: string) => Promise<void> }).setItem('@gitnotes:last_used_repo', 'legacy/repo');
    await LastSelectionPreferenceService.migrateFromLegacy();
    await (AsyncStorage as unknown as { setItem: (k: string, v: string) => Promise<void> }).setItem('@gitnotes:last_used_repo', 'changed/repo');
    await LastSelectionPreferenceService.migrateFromLegacy();
    expect(await LastSelectionPreferenceService.get('note')).toEqual({ repo: 'legacy/repo' });
  });

  test('migrateFromLegacy preserves existing selections', async () => {
    await LastSelectionPreferenceService.set('note', { repo: 'custom/repo', branch: 'dev' });
    await (AsyncStorage as unknown as { setItem: (k: string, v: string) => Promise<void> }).setItem('@gitnotes:last_used_repo', 'legacy/repo');
    await LastSelectionPreferenceService.migrateFromLegacy();
    const noteSelection = await LastSelectionPreferenceService.get('note');
    expect(noteSelection.repo).toBe('custom/repo');
    expect(noteSelection.branch).toBe('dev');
  });
});

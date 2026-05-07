jest.mock(
  '@react-native-async-storage/async-storage',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  bootstrapStorage,
  clearBootCache,
  getBootValue,
} from '../../src/services/StorageBootstrap';
import { StorageService } from '../../src/services/StorageService';

beforeEach(async () => {
  await AsyncStorage.clear?.();
  clearBootCache();
});

describe('StorageBootstrap.getBootValue (consume-on-read)', () => {
  it('returns the bootstrapped value the first time and undefined afterwards', async () => {
    await AsyncStorage.setItem('@gitnotes:repos', '[{"id":"1","name":"r1","path":"a/r1"}]');
    await bootstrapStorage();

    const first = getBootValue('@gitnotes:repos');
    expect(first).toBe('[{"id":"1","name":"r1","path":"a/r1"}]');

    // Consume-on-read: a second hit must miss the cache so callers fall
    // through to AsyncStorage, which is the only source that reflects writes
    // performed after bootstrap.
    const second = getBootValue('@gitnotes:repos');
    expect(second).toBeUndefined();
  });

  it('returns undefined when bootstrap has not run', () => {
    expect(getBootValue('@gitnotes:repos')).toBeUndefined();
  });
});

describe('StorageService picks up writes after bootstrap', () => {
  it('returns the latest repos list after addRepository, without restart', async () => {
    // Simulate an app session that booted with one repo already saved.
    await AsyncStorage.setItem(
      '@gitnotes:repos',
      JSON.stringify([{ id: '1', name: 'r1', path: 'org/r1' }]),
    );
    await bootstrapStorage();

    // First read at startup hits the boot cache and returns r1.
    const initial = await StorageService.getSavedRepositories();
    expect(initial.map((r) => r.path)).toEqual(['org/r1']);

    // User adds a second repo. AsyncStorage now holds both. Without
    // consume-on-read, the next getSavedRepositories would still return the
    // pre-bootstrap snapshot until app restart.
    await StorageService.addRepository({ id: '2', name: 'r2', path: 'org/r2' });

    const after = await StorageService.getSavedRepositories();
    expect(after.map((r) => r.path).sort()).toEqual(['org/r1', 'org/r2']);
  });
});

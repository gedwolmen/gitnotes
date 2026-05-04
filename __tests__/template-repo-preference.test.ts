import AsyncStorage from '@react-native-async-storage/async-storage';
import { TemplateRepoPreferenceService } from '../src/services/TemplateRepoPreferenceService';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
      removeItem: jest.fn(async (k: string) => { delete store[k]; }),
    },
  };
});

describe('TemplateRepoPreferenceService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns null when unset', async () => {
    expect(await TemplateRepoPreferenceService.get()).toBeNull();
  });

  test('round-trips repoPath + branch', async () => {
    await TemplateRepoPreferenceService.set({ repoPath: 'me/repo', branch: 'main' });
    expect(await TemplateRepoPreferenceService.get()).toEqual({ repoPath: 'me/repo', branch: 'main' });
  });

  test('clear removes the pointer', async () => {
    await TemplateRepoPreferenceService.set({ repoPath: 'me/repo', branch: 'main' });
    await TemplateRepoPreferenceService.clear();
    expect(await TemplateRepoPreferenceService.get()).toBeNull();
  });
});

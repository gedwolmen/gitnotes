jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getTreeRecursiveOrThrow: jest.fn(),
    getFileContent: jest.fn(),
  },
}));
jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    loadCustomTemplates: jest.fn(async () => []),
    saveCustomTemplates: jest.fn(async () => undefined),
  },
}));
jest.mock('../src/services/TemplateRepoPreferenceService', () => ({
  TemplateRepoPreferenceService: {
    get: jest.fn(async () => ({ repoPath: 'me/repo', branch: 'main' })),
  },
}));

import { GitHubService } from '../src/services/GitHubService';
import { StorageService } from '../src/services/StorageService';
import { pullTemplatesFromConfiguredRepo } from '../src/services/RepoPullService';

describe('pullTemplatesFromConfiguredRepo', () => {
  beforeEach(() => jest.clearAllMocks());

  test('inserts a template fetched from templates/<slug>.md', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'templates/sprint-retro.md', sha: 's1' },
    ]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValue(
      '---\nid: custom-abc\nname: Sprint Retro\nicon: clipboard-outline\ntags: [retro]\n---\n\nbody\n',
    );

    const pulled = await pullTemplatesFromConfiguredRepo();
    expect(pulled).toBe(1);
    expect(StorageService.saveCustomTemplates).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({
        id: 'custom-abc', name: 'Sprint Retro', filePath: 'templates/sprint-retro.md',
      })]),
    );
  });

  test('reconciles a deleted remote file by removing the local entry', async () => {
    (StorageService.loadCustomTemplates as jest.Mock).mockResolvedValueOnce([
      { id: 'custom-abc', name: 'Old', icon: 'document-outline', description: '', content: '', tags: [], isCustom: true, filePath: 'templates/old.md' },
    ]);
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValue(null);

    await pullTemplatesFromConfiguredRepo();
    const calls = (StorageService.saveCustomTemplates as jest.Mock).mock.calls;
    const lastSaveArgs = calls[calls.length - 1][0];
    expect(lastSaveArgs.find((t: any) => t.id === 'custom-abc')).toBeUndefined();
  });

  test('preserves a local-only custom template (no filePath)', async () => {
    (StorageService.loadCustomTemplates as jest.Mock).mockResolvedValueOnce([
      { id: 'custom-local', name: 'Local Only', icon: 'document-outline', description: '', content: '', tags: [], isCustom: true },
    ]);
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValue(null);

    await pullTemplatesFromConfiguredRepo();
    const calls = (StorageService.saveCustomTemplates as jest.Mock).mock.calls;
    const lastSaveArgs = calls[calls.length - 1][0];
    expect(lastSaveArgs.find((t: any) => t.id === 'custom-local')).toBeDefined();
  });

  test('preserves repo-backed locals when getTreeRecursiveOrThrow throws (transient API failure)', async () => {
    (StorageService.loadCustomTemplates as jest.Mock).mockResolvedValueOnce([
      { id: 'custom-keep', name: 'Keep', icon: 'document-outline', description: '', content: '', tags: [], isCustom: true, filePath: 'templates/keep.md' },
    ]);
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockRejectedValueOnce(new Error('network'));

    const pulled = await pullTemplatesFromConfiguredRepo();
    expect(pulled).toBe(0);
    // Save must NOT have been called — local entries survive
    expect(StorageService.saveCustomTemplates).not.toHaveBeenCalled();
  });

  test('returns 0 when no templates repo is configured', async () => {
    const { TemplateRepoPreferenceService } = require('../src/services/TemplateRepoPreferenceService');
    (TemplateRepoPreferenceService.get as jest.Mock).mockResolvedValueOnce(null);
    expect(await pullTemplatesFromConfiguredRepo()).toBe(0);
  });
});

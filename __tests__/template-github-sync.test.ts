jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    updateFile: jest.fn(async () => ({ content: { sha: 'abc' }, commit: { sha: 'xyz' } })),
    deleteFile: jest.fn(async () => ({ commit: { sha: 'del' } })),
    getFileSha: jest.fn(async () => ({ kind: 'found', sha: 'abc' })),
    getUser: jest.fn(() => ({ name: 'test', login: 'testuser', email: 'test@example.com' })),
  },
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api' as const) },
}));

import { GitHubService } from '../src/services/GitHubService';
import {
  syncTemplateToGitHub,
  deleteTemplateFromGitHub,
} from '../src/services/TemplateGitHubSyncService';

const baseTemplate = {
  id: 'custom-abc',
  name: 'Sprint Retro',
  icon: 'clipboard-outline' as const,
  description: '',
  content: '## body\n',
  tags: [],
  isCustom: true,
};

describe('TemplateGitHubSyncService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('syncTemplateToGitHub builds the path from the slug when no filePath is set', async () => {
    const result = await syncTemplateToGitHub({
      repoPath: 'me/repo',
      branch: 'main',
      template: baseTemplate,
    });
    expect(result.success).toBe(true);
    expect(result.filePath).toBe('templates/sprint-retro.md');
    expect(GitHubService.updateFile).toHaveBeenCalledWith(
      'me', 'repo', 'templates/sprint-retro.md',
      expect.stringContaining('name: Sprint Retro'),
      expect.stringContaining('Add template'),
      'main',
      undefined,
    );
  });

  test('syncTemplateToGitHub reuses filePath on update', async () => {
    await syncTemplateToGitHub({
      repoPath: 'me/repo',
      branch: 'main',
      template: { ...baseTemplate, filePath: 'templates/sprint-retro.md' },
    });
    expect(GitHubService.updateFile).toHaveBeenCalledWith(
      'me', 'repo', 'templates/sprint-retro.md',
      expect.any(String),
      expect.stringContaining('Update template'),
      'main',
      undefined,
    );
  });

  test('deleteTemplateFromGitHub fetches sha when one is not supplied', async () => {
    const result = await deleteTemplateFromGitHub({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: 'templates/sprint-retro.md',
      name: 'Sprint Retro',
    });
    expect(result.success).toBe(true);
    expect(GitHubService.getFileSha).toHaveBeenCalled();
    expect(GitHubService.deleteFile).toHaveBeenCalled();
  });

  test('returns failure when GitHub is not authenticated', async () => {
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValueOnce(false);
    const result = await syncTemplateToGitHub({
      repoPath: 'me/repo',
      branch: 'main',
      template: baseTemplate,
    });
    expect(result.success).toBe(false);
  });
});

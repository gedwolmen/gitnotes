jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getUser: jest.fn(() => ({
      name: 'Test User',
      login: 'testuser',
      email: 'test@test.com',
    })),
    getFileSha: jest.fn(async () => ({ kind: 'found', sha: 'existing-sha' })),
    updateFile: jest.fn(async () => ({ content: { sha: 'newsha' }, commit: { sha: 'commitsha' } })),
    deleteFile: jest.fn(async () => true),
  },
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(async () => 'api'),
  },
}));

jest.mock('../../src/services/CloneSyncService', () => ({
  CloneSyncService: {
    save: jest.fn(async () => ({ success: true })),
  },
}));

jest.mock('../../src/services/TemplateMarkdownService', () => ({
  serializeTemplate: jest.fn(() => 'serialized template body'),
  templateSlug: jest.fn((name: string) => name.toLowerCase().replace(/\s+/g, '-')),
}));

jest.mock('../../src/services/git/defaultsPolicy', () => ({
  resolveDefaultFolder: jest.fn(() => 'templates/'),
  resolveDefaultRepo: jest.fn(async () => 'owner/repo'),
}));

import { syncTemplateToGitHub, deleteTemplateFromGitHub } from '../../src/services/TemplateGitHubSyncService';
import { GitHubService } from '../../src/services/GitHubService';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { CloneSyncService } from '../../src/services/CloneSyncService';
import { templateSlug } from '../../src/services/TemplateMarkdownService';

const mockTemplate = {
  name: 'My Template',
  content: '# Template\n\nBody',
  tags: [] as string[],
};

describe('TemplateGitHubSyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (CloneSyncService.save as jest.Mock).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('syncTemplateToGitHub', () => {
    describe('clone mode uses CloneSyncService.save', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
      });

      test('calls CloneSyncService.save with upsert intent for new template', async () => {
        const result = await syncTemplateToGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          template: mockTemplate,
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toBe('templates/my-template.md');

        expect(CloneSyncService.save).toHaveBeenCalledTimes(1);
        const callArg = (CloneSyncService.save as jest.Mock).mock.calls[0][0];
        expect(callArg.repoPath).toBe('owner/repo');
        expect(callArg.branch).toBe('main');
        expect(callArg.filePath).toBe('templates/my-template.md');
        expect(callArg.intent).toBe('upsert');
        expect(callArg.content).toBe('serialized template body');
        expect(callArg.message).toBe('Add template My Template');
      });

      test('uses Update message when template has existing filePath', async () => {
        const result = await syncTemplateToGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          template: { ...mockTemplate, filePath: 'templates/my-template.md' },
        });

        expect(result.success).toBe(true);
        const callArg = (CloneSyncService.save as jest.Mock).mock.calls[0][0];
        expect(callArg.message).toBe('Update template My Template');
        expect(callArg.filePath).toBe('templates/my-template.md');
      });

      test('returns error when CloneSyncService.save fails', async () => {
        (CloneSyncService.save as jest.Mock).mockResolvedValue({
          success: false,
          error: 'commit failed',
        });

        const result = await syncTemplateToGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          template: mockTemplate,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('commit failed');
      });

      test('propagates queued error from CloneSyncService.save', async () => {
        (CloneSyncService.save as jest.Mock).mockResolvedValue({
          success: false,
          error: 'queued',
        });

        const result = await syncTemplateToGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          template: mockTemplate,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('queued');
      });

      test('propagates conflict-detected error from CloneSyncService.save', async () => {
        (CloneSyncService.save as jest.Mock).mockResolvedValue({
          success: false,
          error: 'conflict-detected',
        });

        const result = await syncTemplateToGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          template: mockTemplate,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('conflict-detected');
      });
    });

    describe('api mode', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
      });

      test('uses GitHubService.updateFile in API mode', async () => {
        const result = await syncTemplateToGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          template: mockTemplate,
        });

        expect(result.success).toBe(true);
        expect(GitHubService.updateFile).toHaveBeenCalledTimes(1);
        expect(CloneSyncService.save).not.toHaveBeenCalled();
      });

      test('returns error when GitHub API returns null', async () => {
        (GitHubService.updateFile as jest.Mock).mockResolvedValue(null);

        const result = await syncTemplateToGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          template: mockTemplate,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('GitHub API returned no result');
      });
    });

    describe('pre-checks', () => {
      test('returns error when not authenticated', async () => {
        (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(false);

        const result = await syncTemplateToGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          template: mockTemplate,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('GitHub not authenticated');
        expect(CloneSyncService.save).not.toHaveBeenCalled();
      });

      test('returns error for invalid repo path', async () => {
        const result = await syncTemplateToGitHub({
          repoPath: '',
          branch: 'main',
          template: mockTemplate,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid repo path');
        expect(CloneSyncService.save).not.toHaveBeenCalled();
      });

      test('returns error when resolveDefaultRepo throws and no repoPath provided', async () => {
        const { resolveDefaultRepo } = require('../../src/services/git/defaultsPolicy');
        resolveDefaultRepo.mockRejectedValueOnce(new Error('No repo'));

        const result = await syncTemplateToGitHub({
          repoPath: undefined as unknown as string,
          branch: 'main',
          template: mockTemplate,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('No repository configured');
      });
    });
  });

  describe('deleteTemplateFromGitHub', () => {
    describe('clone mode uses CloneSyncService.save', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
      });

      test('calls CloneSyncService.save with delete intent', async () => {
        const result = await deleteTemplateFromGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'templates/my-template.md',
          name: 'My Template',
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toBe('templates/my-template.md');

        expect(CloneSyncService.save).toHaveBeenCalledTimes(1);
        const callArg = (CloneSyncService.save as jest.Mock).mock.calls[0][0];
        expect(callArg.repoPath).toBe('owner/repo');
        expect(callArg.branch).toBe('main');
        expect(callArg.filePath).toBe('templates/my-template.md');
        expect(callArg.intent).toBe('delete');
        expect(callArg.message).toBe('Delete template My Template');
      });

      test('returns error when CloneSyncService.save fails', async () => {
        (CloneSyncService.save as jest.Mock).mockResolvedValue({
          success: false,
          error: 'commit failed',
        });

        const result = await deleteTemplateFromGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'templates/my-template.md',
          name: 'My Template',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('commit failed');
      });

      test('propagates queued error from CloneSyncService.save', async () => {
        (CloneSyncService.save as jest.Mock).mockResolvedValue({
          success: false,
          error: 'queued',
        });

        const result = await deleteTemplateFromGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'templates/my-template.md',
          name: 'My Template',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('queued');
      });
    });

    describe('api mode', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
        (GitHubService.getFileSha as jest.Mock).mockResolvedValue({ kind: 'found', sha: 'existing-sha' });
        (GitHubService.deleteFile as jest.Mock).mockResolvedValue(true);
      });

      test('uses GitHubService.deleteFile in API mode', async () => {
        const result = await deleteTemplateFromGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'templates/my-template.md',
          name: 'My Template',
        });

        expect(result.success).toBe(true);
        expect(GitHubService.deleteFile).toHaveBeenCalledTimes(1);
        expect(CloneSyncService.save).not.toHaveBeenCalled();
      });

      test('returns success when file not found on remote', async () => {
        (GitHubService.getFileSha as jest.Mock).mockResolvedValue({ kind: 'not-found' });

        const result = await deleteTemplateFromGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'templates/ghost.md',
          name: 'Ghost',
        });

        expect(result.success).toBe(true);
        expect(GitHubService.deleteFile).not.toHaveBeenCalled();
      });

      test('returns error when file sha lookup fails', async () => {
        (GitHubService.getFileSha as jest.Mock).mockResolvedValue({
          kind: 'error',
          message: 'rate limited',
        });

        const result = await deleteTemplateFromGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'templates/locked.md',
          name: 'Locked',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('rate limited');
        expect(GitHubService.deleteFile).not.toHaveBeenCalled();
      });

      test('returns error when GitHub deleteFile returns null', async () => {
        (GitHubService.deleteFile as jest.Mock).mockResolvedValue(null);

        const result = await deleteTemplateFromGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'templates/my-template.md',
          name: 'My Template',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('GitHub API returned no result');
      });

      test('uses provided sha instead of looking up', async () => {
        const result = await deleteTemplateFromGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'templates/my-template.md',
          name: 'My Template',
          sha: 'provided-sha',
        });

        expect(result.success).toBe(true);
        expect(GitHubService.getFileSha).not.toHaveBeenCalled();
        expect(GitHubService.deleteFile).toHaveBeenCalledWith(
          'owner', 'repo', 'templates/my-template.md',
          'Delete template My Template', 'provided-sha', 'main',
        );
      });
    });

    describe('pre-checks', () => {
      test('returns error when not authenticated', async () => {
        (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(false);

        const result = await deleteTemplateFromGitHub({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'templates/my-template.md',
          name: 'My Template',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('GitHub not authenticated');
        expect(CloneSyncService.save).not.toHaveBeenCalled();
      });

      test('returns error for invalid repo path', async () => {
        const result = await deleteTemplateFromGitHub({
          repoPath: '',
          branch: 'main',
          filePath: 'templates/my-template.md',
          name: 'My Template',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid repo path');
        expect(CloneSyncService.save).not.toHaveBeenCalled();
      });
    });
  });
});

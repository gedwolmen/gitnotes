import { getNoteFileExtension, getSupportedFileExtensions, isSupportedFileExtension } from '../src/models/Note';

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    getRepoContents: jest.fn(),
    getFileContent: jest.fn(),
  },
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    getAllNotes: jest.fn(),
    createNote: jest.fn(),
  },
}));

import { RepoFileSyncService } from '../src/services/RepoFileSyncService';
import { GitHubService } from '../src/services/GitHubService';
import { StorageService } from '../src/services/StorageService';

describe('PDF support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes .pdf in supported note extensions', () => {
    expect(getSupportedFileExtensions()).toContain('.pdf');
    expect(isSupportedFileExtension('design-spec.pdf')).toBe(true);
    expect(getNoteFileExtension('pdf')).toBe('.pdf');
  });

  it('syncs pdf files from repository using GitHub contents API URL as content', async () => {
    const mockedGetRepoContents = GitHubService.getRepoContents as jest.Mock;
    const mockedGetFileContent = GitHubService.getFileContent as jest.Mock;
    const mockedGetAllNotes = StorageService.getAllNotes as jest.Mock;
    const mockedCreateNote = StorageService.createNote as jest.Mock;

    mockedGetRepoContents.mockResolvedValue([
      {
        name: 'architecture.pdf',
        path: 'docs/architecture.pdf',
        type: 'file',
        size: 1024,
        download_url: 'https://raw.githubusercontent.com/org/repo/main/docs/architecture.pdf',
      },
    ]);
    mockedGetFileContent.mockResolvedValue('should-not-be-used-for-pdf');
    mockedGetAllNotes.mockResolvedValue([]);
    mockedCreateNote.mockResolvedValue({ id: 'n1' });

    const result = await RepoFileSyncService.syncRepoFiles('org/repo');

    expect(result.total).toBe(1);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);

    expect(mockedGetFileContent).not.toHaveBeenCalled();
    expect(mockedCreateNote).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'architecture',
        content: 'https://api.github.com/repos/org/repo/contents/docs/architecture.pdf',
        repo: 'org/repo',
        format: 'pdf',
      })
    );
  });
});

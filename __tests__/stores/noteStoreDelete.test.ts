import type { Note } from '@/models/Note';
import { StorageService } from '@/services/StorageService';
import { CloneSyncService } from '@/services/cloneSyncServiceImpl';
import { CommitService } from '@/services/git/CommitService';
import { useNoteStore } from '@/stores/noteStore';

jest.mock('@/services/StorageService', () => ({
  StorageService: {
    deleteNote: jest.fn(),
    createNote: jest.fn(),
  },
}));

jest.mock('@/services/cloneSyncServiceImpl', () => ({
  CloneSyncService: { save: jest.fn() },
  NoteSyncQueueService: {
    onMutationSucceeded: jest.fn(),
    onDroppedMutation: jest.fn(),
  },
}));

jest.mock('@/services/git/CommitService', () => ({
  CommitService: { commit: jest.fn() },
}));

jest.mock('@/services/git/defaultsPolicy', () => ({
  resolveDefaultFolder: jest.fn(() => 'notes/'),
  resolveDefaultRepo: jest.fn(),
}));

jest.mock('@/services/NoteGitHubSyncService', () => ({
  applyNoteTagsToContent: (content: string) => content,
  applyNoteColorToContent: (content: string) => content,
}));

jest.mock('@/services/git/deleteFailures', () => ({
  recordDeleteFailure: jest.fn(),
}));

jest.mock('@/stores/gitOperationStore', () => ({
  gitOperationRegistry: {
    begin: jest.fn(() => 'delete-op'),
    fail: jest.fn(),
    succeed: jest.fn(),
  },
  useGitOperationStore: { getState: jest.fn() },
}));

describe('noteStore delete flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (CloneSyncService.save as jest.Mock).mockResolvedValue({ success: true });
    (StorageService.deleteNote as jest.Mock).mockResolvedValue(true);
  });

  it('deletes a note without creating a commit', async () => {
    const note: Note = {
      id: 'note-1',
      title: 'Example',
      content: 'content',
      createdAt: 1,
      updatedAt: 1,
      tags: [],
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'notes/example.md',
    };
    useNoteStore.setState({ notes: [note], error: null });

    await expect(useNoteStore.getState().deleteNote(note.id)).resolves.toBe(true);

    expect(CloneSyncService.save).toHaveBeenCalledWith(expect.objectContaining({
      repoPath: 'owner/repo',
      filePath: 'notes/example.md',
      intent: 'delete',
    }));
    expect(CommitService.commit).not.toHaveBeenCalled();
  });

  it('writes a new note without creating a commit', async () => {
    const createdNote: Note = {
      id: 'note-2',
      title: 'New note',
      content: 'content',
      createdAt: 1,
      updatedAt: 1,
      tags: [],
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'notes/new-note.md',
    };
    (StorageService.createNote as jest.Mock).mockResolvedValue(createdNote);
    (CommitService.commit as jest.Mock).mockResolvedValue({ success: true });

    await expect(useNoteStore.getState().createNote({
      title: 'New note',
      content: 'content',
      repo: 'owner/repo',
      branch: 'main',
      format: 'markdown',
    })).resolves.toEqual(createdNote);

    expect(CloneSyncService.save).toHaveBeenCalledWith(expect.objectContaining({
      repoPath: 'owner/repo',
      branch: 'main',
      filePath: 'notes/new-note.md',
      intent: 'upsert',
    }));
    expect(CommitService.commit).not.toHaveBeenCalled();
  });
});

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getAllNotes: jest.fn(),
    createNote: jest.fn(),
    updateNote: jest.fn(),
    deleteNote: jest.fn(),
    clearAllNotes: jest.fn(),
    getSavedRepositories: jest.fn(),
  },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    enqueueNoteUpsert: jest.fn(),
    enqueueNoteDelete: jest.fn(),
    drain: jest.fn(),
  },
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(),
  },
}));

jest.mock('../../src/services/CloneSyncService', () => ({
  CloneSyncService: {
    save: jest.fn(),
  },
}));

jest.mock('../../src/services/git/CommitService', () => ({
  CommitService: {
    commit: jest.fn(),
  },
}));

jest.mock('../../src/components/editor/editorShared', () => ({
  slugifyLocal: jest.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
  getExtensionForFormat: jest.fn(() => '.md'),
}));

import { useNoteStore } from '../../src/stores/noteStore';
import { useGitOperationStore } from '../../src/stores/gitOperationStore';
import { StorageService } from '../../src/services/StorageService';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { CloneSyncService } from '../../src/services/CloneSyncService';

import type { Note } from '../../src/models/Note';

const makeNote = (id: string, overrides: Partial<Note> = {}): Note => ({
  id,
  title: `Note ${id}`,
  content: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  tags: [],
  isPinned: false,
  ...overrides,
});

describe('useNoteStore upsertNote (clone mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNoteStore.setState({ notes: [], isLoading: false, error: null, searchQuery: '' });
    useGitOperationStore.setState({ ops: {} });
  });

  describe('clone mode', () => {
    beforeEach(() => {
      (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    });

    it('calls CloneSyncService.save with upsert intent and returns success result', async () => {
      const note = makeNote('1', { repo: 'me/repo', branch: 'main', filePath: 'notes/test.md' });
      useNoteStore.setState({ notes: [note] });
      (CloneSyncService.save as jest.Mock).mockResolvedValue({ success: true });
      (StorageService.updateNote as jest.Mock).mockResolvedValue({ ...note, title: 'Updated' });

      const result = await useNoteStore.getState().upsertNote({
        id: '1',
        repoPath: 'me/repo',
        branch: 'main',
        filePath: 'notes/test.md',
        content: 'updated content',
        title: 'Updated',
      });

      expect(CloneSyncService.save).toHaveBeenCalledWith({
        repoPath: 'me/repo',
        branch: 'main',
        filePath: 'notes/test.md',
        content: 'updated content',
        message: 'Update note: Updated',
        intent: 'upsert',
      });
      expect(result).toEqual({ success: true });
    });

    it('returns CloneSyncService.save success:false result without navigating', async () => {
      const note = makeNote('1', { repo: 'me/repo', branch: 'main', filePath: 'notes/test.md' });
      useNoteStore.setState({ notes: [note] });
      (CloneSyncService.save as jest.Mock).mockResolvedValue({ success: false, error: 'conflict-detected' });
      (StorageService.updateNote as jest.Mock).mockResolvedValue(null);

      const result = await useNoteStore.getState().upsertNote({
        id: '1',
        repoPath: 'me/repo',
        branch: 'main',
        filePath: 'notes/test.md',
        content: 'updated content',
        title: 'Updated',
      });

      expect(result).toEqual({ success: false, error: 'conflict-detected' });
      expect(StorageService.updateNote).not.toHaveBeenCalled();
    });

    it('returns queued error without conflict-detected so caller does NOT navigate', async () => {
      const note = makeNote('1', { repo: 'me/repo', branch: 'main', filePath: 'notes/test.md' });
      useNoteStore.setState({ notes: [note] });
      (CloneSyncService.save as jest.Mock).mockResolvedValue({ success: false, error: 'queued' });

      const result = await useNoteStore.getState().upsertNote({
        id: '1',
        repoPath: 'me/repo',
        branch: 'main',
        filePath: 'notes/test.md',
        content: 'updated content',
        title: 'Updated',
      });

      expect(result).toEqual({ success: false, error: 'queued' });
      expect(result.error).not.toBe('conflict-detected');
    });

    it('returns unknown error without conflict-detected so caller does NOT navigate', async () => {
      const note = makeNote('1', { repo: 'me/repo', branch: 'main', filePath: 'notes/test.md' });
      useNoteStore.setState({ notes: [note] });
      (CloneSyncService.save as jest.Mock).mockResolvedValue({ success: false, error: 'unknown' });

      const result = await useNoteStore.getState().upsertNote({
        id: '1',
        repoPath: 'me/repo',
        branch: 'main',
        filePath: 'notes/test.md',
        content: 'updated content',
        title: 'Updated',
      });

      expect(result).toEqual({ success: false, error: 'unknown' });
      expect(result.error).not.toBe('conflict-detected');
    });

    it('catches CloneSyncService.save throwing and returns unknown error', async () => {
      const note = makeNote('1', { repo: 'me/repo', branch: 'main', filePath: 'notes/test.md' });
      useNoteStore.setState({ notes: [note] });
      (CloneSyncService.save as jest.Mock).mockRejectedValue(new Error('network failure'));
      (StorageService.updateNote as jest.Mock).mockResolvedValue(null);

      const result = await useNoteStore.getState().upsertNote({
        id: '1',
        repoPath: 'me/repo',
        branch: 'main',
        filePath: 'notes/test.md',
        content: 'updated content',
        title: 'Updated',
      });

      expect(result).toEqual({ success: false, error: 'unknown' });
    });
  });

  describe('API mode', () => {
    beforeEach(() => {
      (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
    });

    it('calls NoteSyncQueueService.enqueueNoteUpsert and returns success', async () => {
      const note = makeNote('1', { repo: 'me/repo', branch: 'main', filePath: 'notes/test.md' });
      useNoteStore.setState({ notes: [note] });
      (NoteSyncQueueService.enqueueNoteUpsert as jest.Mock).mockResolvedValue({ id: 'queue-1' });
      (StorageService.updateNote as jest.Mock).mockResolvedValue({ ...note, title: 'Updated' });

      const result = await useNoteStore.getState().upsertNote({
        id: '1',
        repoPath: 'me/repo',
        branch: 'main',
        filePath: 'notes/test.md',
        content: 'updated content',
        title: 'Updated',
      });

      expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledWith({
        repo: 'me/repo',
        branch: 'main',
        filePath: 'notes/test.md',
        title: 'Updated',
        content: 'updated content',
        format: undefined,
        tags: undefined,
        color: undefined,
      });
      expect(CloneSyncService.save).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('API mode upsert is unchanged behavior', async () => {
      const note = makeNote('1', { repo: 'me/repo', branch: 'main', filePath: 'notes/test.md' });
      useNoteStore.setState({ notes: [note] });
      (NoteSyncQueueService.enqueueNoteUpsert as jest.Mock).mockResolvedValue({ id: 'queue-1' });
      (StorageService.updateNote as jest.Mock).mockResolvedValue({ ...note, title: 'Updated' });

      await useNoteStore.getState().upsertNote({
        id: '1',
        repoPath: 'me/repo',
        branch: 'main',
        filePath: 'notes/test.md',
        content: 'updated content',
        title: 'Updated',
      });

      expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalled();
      expect(CloneSyncService.save).not.toHaveBeenCalled();
    });
  });
});

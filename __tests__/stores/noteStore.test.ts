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
    enqueueNoteDelete: jest.fn(),
    drain: jest.fn(),
  },
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api') },
}));

;

jest.mock('../../src/components/editor/editorShared', () => ({
  slugifyLocal: jest.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
  getExtensionForFormat: jest.fn(() => '.md'),
}));

import { useNoteStore } from '../../src/stores/noteStore';
import { useGitOperationStore } from '../../src/stores/gitOperationStore';
import { StorageService } from '../../src/services/StorageService';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';

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

describe('useNoteStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNoteStore.setState({ notes: [], isLoading: false, error: null, searchQuery: '' });
    useGitOperationStore.setState({ ops: {} });
  });

  describe('loadNotes', () => {
    it('loads notes and filters out orphans from deleted repos', async () => {
      const savedRepos = [{ path: 'me/repo' }];
      const notes = [
        makeNote('1', { repo: 'me/repo' }),
        makeNote('2', { repo: 'deleted/repo' }),
        makeNote('3'), // local-only
      ];
      (StorageService.getAllNotes as jest.Mock).mockResolvedValue(notes);
      (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue(savedRepos);

      await useNoteStore.getState().loadNotes();

      const state = useNoteStore.getState().notes;
      expect(state).toHaveLength(2);
      expect(state.find((n) => n.id === '1')).toBeDefined();
      expect(state.find((n) => n.id === '3')).toBeDefined();
      expect(StorageService.deleteNote).toHaveBeenCalledWith('2');
    });

    it('sorts notes with pinned first', async () => {
      (StorageService.getAllNotes as jest.Mock).mockResolvedValue([
        makeNote('1', { isPinned: false }),
        makeNote('2', { isPinned: true }),
      ]);
      (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([]);

      await useNoteStore.getState().loadNotes();

      const ids = useNoteStore.getState().notes.map((n) => n.id);
      expect(ids[0]).toBe('2');
      expect(ids[1]).toBe('1');
    });
  });

  describe('createNote', () => {
    it('creates note and adds to list', async () => {
      const newNote = makeNote('new', { repo: 'me/repo' });
      (StorageService.createNote as jest.Mock).mockResolvedValue(newNote);
      (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([{ path: 'me/repo' }]);

      const result = await useNoteStore.getState().createNote({ title: 'test' });

      expect(result?.id).toBe('new');
      expect(useNoteStore.getState().notes).toHaveLength(1);
    });
  });

  describe('updateNote', () => {
    it('updates existing note in list', async () => {
      useNoteStore.setState({ notes: [makeNote('1')] });
      const updated = makeNote('1', { title: 'Updated' });
      (StorageService.updateNote as jest.Mock).mockResolvedValue(updated);

      await useNoteStore.getState().updateNote({ id: '1', title: 'Updated' });

      expect(useNoteStore.getState().notes[0].title).toBe('Updated');
    });
  });

  describe('deleteNote', () => {
    it('stages the delete for repo-backed notes (api mode removes row immediately and succeeds the op)', async () => {
      const note = makeNote('1', { repo: 'me/repo', branch: 'main', filePath: 'notes/test.md' });
      useNoteStore.setState({ notes: [note] });
      (NoteSyncQueueService.enqueueNoteDelete as jest.Mock).mockResolvedValue({ id: 'queue-1' });
      (StorageService.deleteNote as jest.Mock).mockResolvedValue(true);

      await useNoteStore.getState().deleteNote('1');

      expect(NoteSyncQueueService.enqueueNoteDelete).toHaveBeenCalled();
      expect(StorageService.deleteNote).toHaveBeenCalledWith('1');
      expect(useNoteStore.getState().notes).toHaveLength(0);
      expect(useGitOperationStore.getState().ops).toEqual({});
    });

    it('removes note from list after successful local delete', async () => {
      useNoteStore.setState({ notes: [makeNote('1')] });
      (StorageService.deleteNote as jest.Mock).mockResolvedValue(true);

      await useNoteStore.getState().deleteNote('1');

      expect(useNoteStore.getState().notes).toHaveLength(0);
    });

    it('treats an already-removed row as success when the write-through side channel completed the delete (#932 QA)', async () => {
      // API-mode write-through: enqueueNoteDelete succeeded but the
      // side-channel (onMutationSucceeded) already removed the note from
      // state + storage. The subsequent direct StorageService.deleteNote(id)
      // returns false — deleteNote must report SUCCESS, not a failed delete.
      const note = makeNote('1', { repo: 'me/repo', branch: 'main', filePath: 'notes/test.md' });
      useNoteStore.setState({ notes: [note] });
      // Simulate the write-through side channel removing the row during
      // enqueueNoteDelete (the queue processed the delete end-to-end).
      (NoteSyncQueueService.enqueueNoteDelete as jest.Mock).mockImplementation(async () => {
        useNoteStore.setState({ notes: [] });
        return { id: 'queue-1' };
      });
      (StorageService.deleteNote as jest.Mock).mockResolvedValue(false);

      const result = await useNoteStore.getState().deleteNote('1');

      expect(result).toBe(true);
      expect(NoteSyncQueueService.enqueueNoteDelete).toHaveBeenCalled();
      expect(useGitOperationStore.getState().ops).toEqual({}); // op succeeded, not failed
    });
  });

  describe('dropByFilePaths', () => {
    it('purges local notes whose repo+filePath match, without touching the queue', async () => {
      const note = makeNote('1', { repo: 'owner/repo', branch: 'main', filePath: 'notes/foo.md' });
      useNoteStore.setState({ notes: [note, makeNote('2', { repo: 'other/repo', filePath: 'notes/foo.md' })] });
      (StorageService.deleteNote as jest.Mock).mockResolvedValue(true);

      const dropped = await useNoteStore.getState().dropByFilePaths('owner/repo', ['notes/foo.md']);

      expect(dropped).toBe(1);
      expect(StorageService.deleteNote).toHaveBeenCalledWith('1');
      expect(NoteSyncQueueService.enqueueNoteDelete).not.toHaveBeenCalled();
      expect(NoteSyncQueueService.drain).not.toHaveBeenCalled();
      expect(useNoteStore.getState().notes.map((n) => n.id)).toEqual(['2']);
    });

    it('matches notes by derived default path when filePath is unset', async () => {
      const note = makeNote('1', { repo: 'owner/repo', branch: 'main', title: 'Foo Bar', format: 'markdown' });
      useNoteStore.setState({ notes: [note] });
      (StorageService.deleteNote as jest.Mock).mockResolvedValue(true);

      const dropped = await useNoteStore.getState().dropByFilePaths('owner/repo', ['notes/foo-bar.md']);

      expect(dropped).toBe(1);
      expect(StorageService.deleteNote).toHaveBeenCalledWith('1');
      expect(useNoteStore.getState().notes).toHaveLength(0);
    });

    it('is a no-op when no note matches the repo or paths', async () => {
      useNoteStore.setState({ notes: [makeNote('1', { repo: 'owner/repo', filePath: 'notes/other.md' })] });

      const dropped = await useNoteStore.getState().dropByFilePaths('owner/repo', ['notes/foo.md']);

      expect(dropped).toBe(0);
      expect(StorageService.deleteNote).not.toHaveBeenCalled();
      expect(useNoteStore.getState().notes).toHaveLength(1);
    });
  });

  describe('togglePin', () => {
    it('toggles isPinned flag', async () => {
      const note = makeNote('1', { isPinned: false });
      useNoteStore.setState({ notes: [note] });
      const updated = makeNote('1', { isPinned: true });
      (StorageService.updateNote as jest.Mock).mockResolvedValue(updated);

      await useNoteStore.getState().togglePin('1');

      expect(useNoteStore.getState().notes[0].isPinned).toBe(true);
    });
  });

  describe('setSearchQuery', () => {
    it('updates searchQuery state', () => {
      useNoteStore.getState().setSearchQuery('test');
      expect(useNoteStore.getState().searchQuery).toBe('test');
    });
  });
});
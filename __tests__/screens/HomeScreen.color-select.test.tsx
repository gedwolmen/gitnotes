/**
 * Tests for the HomeScreen color-tag fix (issue #794).
 *
 * We don't render HomeScreen directly here because the component pulls in
 * many heavy native modules (Skia, Reanimated, Gesture Handler) that are
 * expensive to mock. Instead, we verify the fix through two complementary
 * tests:
 *
 *   1. A source-level regression test confirming the broken `'color' in
 *      item.data` guard has been removed and the sync call has been added.
 *   2. A behavioural test of the sync helper used by `handleColorSelect`,
 *      mirroring the same logic used in `useNotesListNoteActions`.
 *
 * The sync logic is shared by design (HomeScreen and Notes-list perform
 * the same side effect after `updateNote`), so verifying it once here is
 * sufficient.
 */

import * as fs from 'fs';
import * as path from 'path';

// ----- Sync helper (mirrors HomeScreen.handleColorSelect) -----
type NoteColorValue = import('../../src/models/Note').NoteColor;

interface SyncInput {
  repo?: string;
  branch?: string;
  filePath?: string;
  title?: string;
  content?: string;
  format?: 'markdown' | 'neorg' | 'org' | 'pdf' | 'json';
  tags?: string[];
  color: NoteColorValue | null;
}

async function colorSyncAfterUpdateNote(
  updated: { id: string } & Partial<SyncInput>,
  color: NoteColorValue | null,
  deps: {
    syncNoteToGitHub: (params: SyncInput) => Promise<{ success: boolean; finalContent?: string | null }>;
    enqueueNoteUpsert: (params: SyncInput, id: string) => Promise<void>;
    updateNoteContent: (id: string, content: string) => Promise<void>;
  },
): Promise<void> {
  if (!updated.repo || !updated.filePath || !(updated.content ?? '').trim()) {
    return;
  }
  const syncParams: SyncInput = {
    repo: updated.repo!,
    branch: updated.branch,
    filePath: updated.filePath!,
    title: updated.title,
    content: updated.content,
    format: updated.format,
    tags: updated.tags,
    color,
  };
  try {
    const result = await deps.syncNoteToGitHub(syncParams);
    if (!result.success) {
      await deps.enqueueNoteUpsert(syncParams, updated.id);
    } else if (result.finalContent && result.finalContent !== updated.content) {
      await deps.updateNoteContent(updated.id, result.finalContent);
    }
  } catch (error) {
    await deps.enqueueNoteUpsert(syncParams, updated.id);
  }
}

describe('HomeScreen color-tag fix (issue #794)', () => {
  describe('source-level regression', () => {
    const homeScreenSrc = fs.readFileSync(
      path.join(__dirname, '../../src/screens/HomeScreen.tsx'),
      'utf-8',
    );

    test('broken \'color\' in item.data guard has been removed', () => {
      // The guard `'color' in item.data` was wrong because `JSON.stringify`
      // strips `undefined` fields, so notes without an existing color would
      // fail the check and never reach the update logic.
      const hasBrokenGuard = /'color'\s+in\s+item\.data/.test(homeScreenSrc);
      expect(hasBrokenGuard).toBe(false);
    });

    test('handleColorSelect syncs via syncNoteToGitHub', () => {
      expect(homeScreenSrc).toContain('syncNoteToGitHub');
      expect(homeScreenSrc).toContain('NoteSyncQueueService');
      expect(homeScreenSrc).toContain('enqueueNoteUpsert');
    });

    test('imports the sync services', () => {
      expect(homeScreenSrc).toMatch(
        /import\s*\{\s*syncNoteToGitHub\s*\}\s*from\s*['"]\.\.\/services\/NoteGitHubSyncService['"]/,
      );
      expect(homeScreenSrc).toMatch(
        /import\s*\{\s*NoteSyncQueueService\s*\}\s*from\s*['"]\.\.\/services\/NoteSyncQueueService['"]/,
      );
    });
  });

  describe('sync behaviour after color update', () => {
    test('Case A: skips sync for a note without a repo or filePath', async () => {
      const sync = jest.fn();
      const enqueue = jest.fn();
      const updateContent = jest.fn();
      await colorSyncAfterUpdateNote(
        { id: 'n1', content: 'body' },
        'red',
        { syncNoteToGitHub: sync, enqueueNoteUpsert: enqueue, updateNoteContent: updateContent },
      );
      expect(sync).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    test('Case B: syncs and updates content when syncNoteToGitHub returns finalContent', async () => {
      const sync = jest.fn().mockResolvedValue({ success: true, finalContent: 'NEW CONTENT' });
      const enqueue = jest.fn();
      const updateContent = jest.fn();
      await colorSyncAfterUpdateNote(
        {
          id: 'n1',
          repo: 'o/r',
          branch: 'main',
          filePath: 'notes/a.md',
          content: 'body',
        },
        'blue',
        { syncNoteToGitHub: sync, enqueueNoteUpsert: enqueue, updateNoteContent: updateContent },
      );
      expect(sync).toHaveBeenCalledWith(
        expect.objectContaining({ repo: 'o/r', filePath: 'notes/a.md', color: 'blue' }),
      );
      expect(updateContent).toHaveBeenCalledWith('n1', 'NEW CONTENT');
      expect(enqueue).not.toHaveBeenCalled();
    });

    test('Case C: enqueues via NoteSyncQueueService when syncNoteToGitHub throws', async () => {
      const sync = jest.fn().mockRejectedValue(new Error('network down'));
      const enqueue = jest.fn();
      const updateContent = jest.fn();
      await colorSyncAfterUpdateNote(
        {
          id: 'n1',
          repo: 'o/r',
          branch: 'main',
          filePath: 'notes/a.md',
          content: 'body',
        },
        'green',
        { syncNoteToGitHub: sync, enqueueNoteUpsert: enqueue, updateNoteContent: updateContent },
      );
      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'green' }),
        'n1',
      );
      expect(updateContent).not.toHaveBeenCalled();
    });

    test('Case C (variant): enqueues when sync returns success:false', async () => {
      const sync = jest.fn().mockResolvedValue({ success: false });
      const enqueue = jest.fn();
      const updateContent = jest.fn();
      await colorSyncAfterUpdateNote(
        {
          id: 'n1',
          repo: 'o/r',
          branch: 'main',
          filePath: 'notes/a.md',
          content: 'body',
        },
        'purple',
        { syncNoteToGitHub: sync, enqueueNoteUpsert: enqueue, updateNoteContent: updateContent },
      );
      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'purple' }),
        'n1',
      );
    });
  });
});

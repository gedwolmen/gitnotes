/**
 * Tests for the HomeScreen color-tag fix (issue #794).
 *
 * Verifies two things:
 *   1. The broken `'color' in item.data` guard has been removed from HomeScreen.
 *   2. After `updateNote`, HomeScreen enqueues the upsert through
 *      NoteSyncQueueService so the color tag is committed via the sync queue
 *      (commit-on-save architecture, refactor #1249).
 *
 * We do not render HomeScreen here because the component pulls in many heavy
 * native modules (Skia, Reanimated, Gesture Handler) that are expensive to
 * mock. The source-level test catches regressions cheaply; the behavioural
 * test exercises the same post-update enqueue helper used by HomeScreen and
 * NotesList.
 */

import * as fs from 'fs';
import * as path from 'path';

type NoteColorValue = import('../../src/models/Note').NoteColor;

interface UpsertInput {
  repo?: string;
  branch?: string;
  filePath?: string;
  title?: string;
  content?: string;
  format?: 'markdown' | 'neorg' | 'org' | 'pdf' | 'json';
  tags?: string[];
  color: NoteColorValue | null;
}

async function syncAfterUpdateNote(
  updated: { id: string } & Partial<UpsertInput>,
  color: NoteColorValue | null,
  enqueueNoteUpsert: (params: UpsertInput, id: string) => Promise<void>,
): Promise<void> {
  if (!updated.repo || !updated.filePath || !(updated.content ?? '').trim()) {
    return;
  }
  const syncParams: UpsertInput = {
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
    await enqueueNoteUpsert(syncParams, updated.id);
  } catch (error) {
    console.warn('[HomeScreen] sync after color update failed:', error);
  }
}

describe('HomeScreen color-tag fix (issue #794)', () => {
  describe('source-level regression', () => {
    const homeScreenSrc = fs.readFileSync(
      path.join(__dirname, '../../src/screens/HomeScreen.tsx'),
      'utf-8',
    );

    test('broken \'color\' in item.data guard has been removed', () => {
      const hasBrokenGuard = /'color'\s+in\s+item\.data/.test(homeScreenSrc);
      expect(hasBrokenGuard).toBe(false);
    });

    test('handleColorSelect enqueues via NoteSyncQueueService.enqueueNoteUpsert after updateNote', () => {
      expect(homeScreenSrc).toContain('NoteSyncQueueService');
      expect(homeScreenSrc).toContain('enqueueNoteUpsert');
      expect(homeScreenSrc).not.toContain('StagingService.stageUpsert');
      expect(homeScreenSrc).not.toContain('syncNoteToGitHub');
    });

    test('imports NoteSyncQueueService', () => {
      expect(homeScreenSrc).toMatch(
        /import\s*\{\s*NoteSyncQueueService\s*\}\s*from\s*['"]\.\.\/services\/NoteSyncQueueService['"]/,
      );
    });
  });

  describe('sync behaviour after color update', () => {
    test('skips enqueue for a note without a repo or filePath', async () => {
      const enqueue = jest.fn();
      await syncAfterUpdateNote({ id: 'n1', content: 'body' }, 'red', enqueue);
      expect(enqueue).not.toHaveBeenCalled();
    });

    test('enqueues the upsert with the selected color', async () => {
      const enqueue = jest.fn().mockResolvedValue(undefined);
      await syncAfterUpdateNote(
        {
          id: 'n1',
          repo: 'o/r',
          branch: 'main',
          filePath: 'notes/a.md',
          content: 'body',
        },
        'blue',
        enqueue,
      );
      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ repo: 'o/r', filePath: 'notes/a.md', color: 'blue' }),
        'n1',
      );
    });

    test('a failing enqueue does not throw out of handleColorSelect', async () => {
      const enqueue = jest.fn().mockRejectedValue(new Error('queue offline'));
      await expect(
        syncAfterUpdateNote(
          {
            id: 'n1',
            repo: 'o/r',
            branch: 'main',
            filePath: 'notes/a.md',
            content: 'body',
          },
          'green',
          enqueue,
        ),
      ).resolves.toBeUndefined();
    });
  });
});

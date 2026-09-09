/**
 * NoteSyncQueueService.test.ts
 *
 * Regression tests for NoteSyncQueueService queue isolation and branch payload preservation.
 *
 * Tests cover:
 * 1. Queue isolation (pauseAllExcept)
 * 2. Branch payload preservation
 * 3. Stale-state reconciliation
 * 4. Active-branch refresh
 * 5. Automatic entity branch assignment
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GitFsService } from '@/services/git/GitFsService';
import { NoteSyncQueueService, type QueueItem, type EntityType } from '@/services/git/NoteSyncQueueService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
}));

// Mock GitFsService
jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    getCurrentBranch: jest.fn(),
  },
}));

const mockGetCurrentBranch = GitFsService.getCurrentBranch as jest.Mock;
const mockAsyncStorageGetItem = AsyncStorage.getItem as jest.Mock;
const mockAsyncStorageSetItem = AsyncStorage.setItem as jest.Mock;

describe('NoteSyncQueueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorageGetItem.mockResolvedValue(null);
    mockAsyncStorageSetItem.mockResolvedValue(undefined);
    mockGetCurrentBranch.mockResolvedValue('main');
  });

  describe('enqueue with automatic branch assignment', () => {
    it('preserves branch identity on every enqueued item', async () => {
      const item: Omit<QueueItem, 'id' | 'createdAt' | 'attempts' | 'status'> = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        branch: 'feature-branch',
        entityType: 'note',
        entityId: 'note-123',
        payload: { intent: 'upsert', content: 'test' },
      };

      const id = await NoteSyncQueueService.enqueue(item);

      expect(id).toBeDefined();
      const savedQueue = JSON.parse(mockAsyncStorageSetItem.mock.calls[0][1]);
      expect(savedQueue).toHaveLength(1);
      expect(savedQueue[0].branch).toBe('feature-branch');
    });

    it('accepts all entity types with branch assignment', async () => {
      const entityTypes: EntityType[] = ['note', 'canvas', 'todo', 'journal'];

      for (const entityType of entityTypes) {
        mockAsyncStorageGetItem.mockResolvedValueOnce(null);
        mockAsyncStorageSetItem.mockResolvedValueOnce(undefined);

        const id = await NoteSyncQueueService.enqueue({
          repoId: 'repo-1',
          repoPath: 'owner/repo',
          branch: 'main',
          entityType,
          entityId: `${entityType}-123`,
          payload: { intent: 'upsert' },
        });

        expect(id).toBeDefined();
      }
    });
  });

  describe('queue isolation on branch switch', () => {
    it('pauses all non-active-branch items on pauseAllExcept', async () => {
      const existingQueue: QueueItem[] = [
        {
          id: 'q1',
          repoId: 'repo-1',
          repoPath: 'owner/repo',
          branch: 'main',
          entityType: 'note',
          entityId: 'note-1',
          payload: { intent: 'upsert' },
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0,
        },
        {
          id: 'q2',
          repoId: 'repo-1',
          repoPath: 'owner/repo',
          branch: 'feature-branch',
          entityType: 'note',
          entityId: 'note-2',
          payload: { intent: 'upsert' },
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0,
        },
        {
          id: 'q3',
          repoId: 'repo-1',
          repoPath: 'owner/repo',
          branch: 'develop',
          entityType: 'note',
          entityId: 'note-3',
          payload: { intent: 'upsert' },
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0,
        },
      ];

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(existingQueue));
      mockAsyncStorageSetItem.mockResolvedValueOnce(undefined);

      await NoteSyncQueueService.pauseAllExcept('repo-1', 'feature-branch');

      const savedQueue = JSON.parse(mockAsyncStorageSetItem.mock.calls[0][1]);
      const q1 = savedQueue.find((i: QueueItem) => i.id === 'q1');
      const q2 = savedQueue.find((i: QueueItem) => i.id === 'q2');
      const q3 = savedQueue.find((i: QueueItem) => i.id === 'q3');

      expect(q1.status).toBe('paused');
      expect(q2.status).toBe('pending'); // active branch stays pending
      expect(q3.status).toBe('paused');
    });

    it('drains only active-branch items matching repoId + branch', async () => {
      const existingQueue: QueueItem[] = [
        {
          id: 'q1',
          repoId: 'repo-1',
          repoPath: 'owner/repo',
          branch: 'main',
          entityType: 'note',
          entityId: 'note-1',
          payload: { intent: 'upsert' },
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0,
        },
        {
          id: 'q2',
          repoId: 'repo-1',
          repoPath: 'owner/repo',
          branch: 'feature-branch',
          entityType: 'note',
          entityId: 'note-2',
          payload: { intent: 'upsert' },
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0,
        },
      ];

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(existingQueue));
      mockGetCurrentBranch.mockResolvedValueOnce('feature-branch');
      mockAsyncStorageSetItem.mockResolvedValueOnce(undefined);

      const drained = await NoteSyncQueueService.drain('repo-1', 'feature-branch');

      expect(drained).toHaveLength(1);
      expect(drained[0].id).toBe('q2');
      expect(drained[0].branch).toBe('feature-branch');
    });

    it('does not drain items when HEAD has switched away from branch', async () => {
      const existingQueue: QueueItem[] = [
        {
          id: 'q1',
          repoId: 'repo-1',
          repoPath: 'owner/repo',
          branch: 'feature-branch',
          entityType: 'note',
          entityId: 'note-1',
          payload: { intent: 'upsert' },
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0,
        },
      ];

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(existingQueue));
      mockGetCurrentBranch.mockResolvedValueOnce('main'); // HEAD has switched!
      mockAsyncStorageSetItem.mockResolvedValueOnce(undefined);

      const drained = await NoteSyncQueueService.drain('repo-1', 'feature-branch');

      expect(drained).toHaveLength(0);

      // Verify the item was marked as paused
      const savedQueue = JSON.parse(mockAsyncStorageSetItem.mock.calls[0][1]);
      expect(savedQueue[0].status).toBe('paused');
    });
  });

  describe('preserved internal branch payloads', () => {
    it('preserves full payload structure including branch identity', async () => {
      const item: Omit<QueueItem, 'id' | 'createdAt' | 'attempts' | 'status'> = {
        repoId: 'repo-1',
        repoPath: 'owner/repo',
        branch: 'feature-branch',
        entityType: 'note',
        entityId: 'note-123',
        payload: {
          intent: 'upsert',
          content: '# Test Note',
          filePath: 'notes/test.md',
          customField: 'preserved',
        },
      };

      const id = await NoteSyncQueueService.enqueue(item);

      const savedQueue = JSON.parse(mockAsyncStorageSetItem.mock.calls[0][1]);
      const savedItem = savedQueue.find((i: QueueItem) => i.id === id);

      expect(savedItem.branch).toBe('feature-branch');
      expect(savedItem.payload.intent).toBe('upsert');
      expect(savedItem.payload.customField).toBe('preserved');
      expect(savedItem.entityType).toBe('note');
      expect(savedItem.entityId).toBe('note-123');
    });

    it('preserves branch identity on pauseForBranchSwitch', async () => {
      const existingQueue: QueueItem[] = [
        {
          id: 'q1',
          repoId: 'repo-1',
          repoPath: 'owner/repo',
          branch: 'feature-branch',
          entityType: 'note',
          entityId: 'note-1',
          payload: { intent: 'upsert', customData: 'keep-me' },
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0,
        },
      ];

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(existingQueue));
      mockAsyncStorageSetItem.mockResolvedValueOnce(undefined);

      await NoteSyncQueueService.pauseForBranchSwitch('feature-branch');

      const savedQueue = JSON.parse(mockAsyncStorageSetItem.mock.calls[0][1]);
      expect(savedQueue[0].branch).toBe('feature-branch');
      expect(savedQueue[0].payload.customData).toBe('keep-me');
    });

    it('preserves branch identity on resumeForBranch', async () => {
      const existingQueue: QueueItem[] = [
        {
          id: 'q1',
          repoId: 'repo-1',
          repoPath: 'owner/repo',
          branch: 'feature-branch',
          entityType: 'note',
          entityId: 'note-1',
          payload: { intent: 'upsert' },
          status: 'paused',
          createdAt: Date.now(),
          attempts: 0,
        },
      ];

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(existingQueue));
      mockGetCurrentBranch.mockResolvedValueOnce('feature-branch');
      mockAsyncStorageSetItem.mockResolvedValueOnce(undefined);

      await NoteSyncQueueService.resumeForBranch('feature-branch');

      const savedQueue = JSON.parse(mockAsyncStorageSetItem.mock.calls[0][1]);
      expect(savedQueue[0].status).toBe('pending');
      expect(savedQueue[0].branch).toBe('feature-branch');
    });
  });

  describe('stale-state reconciliation', () => {
    it('marks items as paused when HEAD differs from expected branch', async () => {
      const existingQueue: QueueItem[] = [
        {
          id: 'q1',
          repoId: 'repo-1',
          repoPath: 'owner/repo',
          branch: 'old-branch',
          entityType: 'note',
          entityId: 'note-1',
          payload: { intent: 'upsert' },
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0,
        },
      ];

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(existingQueue));
      mockGetCurrentBranch.mockResolvedValueOnce('new-branch'); // HEAD has switched
      mockAsyncStorageSetItem.mockResolvedValueOnce(undefined);

      const drained = await NoteSyncQueueService.drain('repo-1', 'old-branch');

      expect(drained).toHaveLength(0);

      const savedQueue = JSON.parse(mockAsyncStorageSetItem.mock.calls[0][1]);
      expect(savedQueue[0].status).toBe('paused');
    });

    it('returns drained items only when HEAD matches expected branch', async () => {
      const existingQueue: QueueItem[] = [
        {
          id: 'q1',
          repoId: 'repo-1',
          repoPath: 'owner/repo',
          branch: 'main',
          entityType: 'note',
          entityId: 'note-1',
          payload: { intent: 'upsert' },
          status: 'pending',
          createdAt: Date.now(),
          attempts: 0,
        },
      ];

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(existingQueue));
      mockGetCurrentBranch.mockResolvedValueOnce('main'); // HEAD matches
      mockAsyncStorageSetItem.mockResolvedValueOnce(undefined);

      const drained = await NoteSyncQueueService.drain('repo-1', 'main');

      expect(drained).toHaveLength(1);
      expect(drained[0].id).toBe('q1');
    });
  });

  describe('active-branch refresh', () => {
    it('pendingCount filters by branch correctly', async () => {
      const existingQueue: QueueItem[] = [
        { id: 'q1', repoId: 'repo-1', repoPath: 'owner/repo', branch: 'main', entityType: 'note', entityId: 'n1', payload: {}, status: 'pending', createdAt: 1, attempts: 0 },
        { id: 'q2', repoId: 'repo-1', repoPath: 'owner/repo', branch: 'main', entityType: 'note', entityId: 'n2', payload: {}, status: 'pending', createdAt: 2, attempts: 0 },
        { id: 'q3', repoId: 'repo-1', repoPath: 'owner/repo', branch: 'feature', entityType: 'note', entityId: 'n3', payload: {}, status: 'pending', createdAt: 3, attempts: 0 },
        { id: 'q4', repoId: 'repo-1', repoPath: 'owner/repo', branch: 'main', entityType: 'note', entityId: 'n4', payload: {}, status: 'paused', createdAt: 4, attempts: 0 },
      ];

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(existingQueue));

      const mainPending = await NoteSyncQueueService.pendingCount('repo-1', 'main');
      const featurePending = await NoteSyncQueueService.pendingCount('repo-1', 'feature');

      expect(mainPending).toBe(2); // q1 and q2 (q4 is paused)
      expect(featurePending).toBe(1); // q3
    });

    it('getAllForRepo returns all items with preserved branch identity', async () => {
      const existingQueue: QueueItem[] = [
        { id: 'q1', repoId: 'repo-1', repoPath: 'owner/repo', branch: 'main', entityType: 'note', entityId: 'n1', payload: {}, status: 'pending', createdAt: 1, attempts: 0 },
        { id: 'q2', repoId: 'repo-1', repoPath: 'owner/repo', branch: 'feature', entityType: 'note', entityId: 'n2', payload: {}, status: 'pending', createdAt: 2, attempts: 0 },
        { id: 'q3', repoId: 'repo-2', repoPath: 'other/repo', branch: 'main', entityType: 'note', entityId: 'n3', payload: {}, status: 'pending', createdAt: 3, attempts: 0 },
      ];

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(existingQueue));

      const items = await NoteSyncQueueService.getAllForRepo('repo-1');

      expect(items).toHaveLength(2);
      expect(items.map((i: QueueItem) => i.branch)).toEqual(['main', 'feature']);
    });
  });

  describe('queue item removal', () => {
    it('remove purges processed items and preserves other branches', async () => {
      const existingQueue: QueueItem[] = [
        { id: 'q1', repoId: 'repo-1', repoPath: 'owner/repo', branch: 'main', entityType: 'note', entityId: 'n1', payload: {}, status: 'pending', createdAt: 1, attempts: 0 },
        { id: 'q2', repoId: 'repo-1', repoPath: 'owner/repo', branch: 'feature', entityType: 'note', entityId: 'n2', payload: {}, status: 'pending', createdAt: 2, attempts: 0 },
      ];

      mockAsyncStorageGetItem.mockResolvedValueOnce(JSON.stringify(existingQueue));
      mockAsyncStorageSetItem.mockResolvedValueOnce(undefined);

      await NoteSyncQueueService.remove('q1');

      const savedQueue = JSON.parse(mockAsyncStorageSetItem.mock.calls[0][1]);
      expect(savedQueue).toHaveLength(1);
      expect(savedQueue[0].id).toBe('q2');
      expect(savedQueue[0].branch).toBe('feature');
    });
  });
});

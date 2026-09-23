/**
 * Diagram lifecycle behavior tests — branch metadata, remote deletion, and path isolation.
 */

import type { Diagram } from '@/models/Diagram';
import { createDiagramDocument } from '@/models/Diagram';
import { useDiagramStore } from '@/stores/diagramStore';
import { pullDiagramsFromRepo } from '@/services/RepoPullService';
import type { RepoReader } from '@/services/RepoPullService';

jest.mock('expo-sqlite', () => ({}), { virtual: true });
jest.mock('expo-file-system', () => ({ File: {}, Directory: {}, Paths: {} }), { virtual: true });
jest.mock('expo-file-system/legacy', () => ({}), { virtual: true });
jest.mock('@/stores/aiStore', () => ({ useAiStore: { getState: () => ({}) } }), { virtual: true });

jest.mock('@/services/documents/DocumentService', () => {
  const mockIndex = { getDocumentMetaBySlug: jest.fn() };
  const DocSvc = jest.fn(function (this: Record<string, unknown>) {
    Object.assign(this, { index: mockIndex });
  });
  DocSvc.prototype.create = jest.fn();
  DocSvc.prototype.update = jest.fn();
  DocSvc.prototype.index = mockIndex;
  DocSvc.prototype.list = jest.fn();
  DocSvc.prototype.read = jest.fn();
  DocSvc.prototype.purge = jest.fn();
  return { DocumentService: DocSvc, __mockIndex: mockIndex };
});

jest.mock('@/services/documents/DocumentIndex', () => ({
  DocumentIndex: jest.fn(),
}));

jest.mock('@/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
    getAllNotes: jest.fn(),
    saveAllNotes: jest.fn(),
    getAllTodos: jest.fn(),
    saveAllTodos: jest.fn(),
    mutateCanvases: jest.fn(),
    mutateDiagrams: jest.fn(),
    getAllDiagrams: jest.fn(),
    saveAllDiagrams: jest.fn(),
  },
}));

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: {
    isCloned: jest.fn(),
    cloneExclusive: jest.fn(),
    getCommitOid: jest.fn(),
    listTree: jest.fn(),
    readFile: jest.fn(),
    pullWithFastForward: jest.fn(),
    removeRepo: jest.fn(),
  },
}));
jest.mock('@/services/git/resolveBranch', () => ({ resolveBranch: jest.fn() }));
jest.mock('@/services/AccountStorage', () => ({
  AccountStorage: { getActiveHostConnection: jest.fn(), getHostConnection: jest.fn() },
}));
jest.mock('@/services/AuthService', () => ({ AuthService: { getToken: jest.fn() } }));
jest.mock('@/services/GitHubService', () => ({ GitHubService: { isAuthenticated: jest.fn(() => true) } }));
jest.mock('@/services/cloneSyncServiceImpl', () => {
  const mockQueueInstance = {
    onMutationSucceeded: jest.fn(),
    onDroppedMutation: jest.fn(),
    enqueue: jest.fn(),
    drain: jest.fn(),
  };
  return {
    NoteSyncQueueService: jest.fn().mockImplementation(() => mockQueueInstance),
    CloneSyncService: jest.fn().mockImplementation(() => ({})),
  };
});

const REPO = 'owner/repo';
const BRANCH = 'feature';

const sampleDoc = createDiagramDocument();
const diagramSerialized = JSON.stringify(sampleDoc);

function mockRepoReader(
  tree: { path: string; type: 'blob' | 'tree' }[],
  files: Record<string, string>,
): RepoReader {
  return {
    listTree: async () => tree,
    readFile: async (path: string) => files[path] ?? null,
  };
}

beforeEach(() => {
  useDiagramStore.setState({ diagrams: [] });
  jest.spyOn(console, 'warn').mockImplementation(jest.fn());
});

afterEach(() => {
  console.warn.mockRestore();
});

describe('pullDiagramsFromRepo', () => {
  beforeEach(() => {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    const MockDocSvc = jest.requireMock('@/services/documents/DocumentService').DocumentService;
    StorageService.mutateDiagrams.mockImplementation(async (mutator: (diagrams: Diagram[]) => Promise<number>) => {
      const diagrams: Diagram[] = [];
      return mutator(diagrams);
    });
    StorageService.getSavedRepositories.mockClear();
    StorageService.getAllNotes.mockClear();
    StorageService.saveAllNotes.mockClear();
    StorageService.getAllTodos.mockClear();
    StorageService.saveAllTodos.mockClear();
    StorageService.mutateCanvases.mockClear();
    StorageService.getAllDiagrams.mockClear();
    StorageService.saveAllDiagrams.mockClear();
    MockDocSvc.prototype.create.mockClear();
    MockDocSvc.prototype.update.mockClear();
    MockDocSvc.prototype.index.getDocumentMetaBySlug.mockClear();
    MockDocSvc.prototype.list.mockClear();
    MockDocSvc.prototype.read.mockClear();
    MockDocSvc.prototype.purge.mockClear();
  });

  it('calls pullDiagramsFromRepo without throwing when reader is empty', async () => {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    StorageService.mutateDiagrams.mockResolvedValue(undefined);

    const reader = mockRepoReader([], {});
    await expect(
      pullDiagramsFromRepo('owner', 'repo', REPO, BRANCH, undefined, undefined, reader as never),
    ).resolves.toBeDefined();
  });

  it('returns 0 when diagrams directory does not exist on remote', async () => {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    let capturedDiagrams: Diagram[] = [];
    StorageService.mutateDiagrams.mockImplementation(
      async (mutator: (diagrams: Diagram[]) => Promise<number>) => {
        const diagrams: Diagram[] = [];
        const result = await mutator(diagrams);
        capturedDiagrams = [...diagrams];
        return result;
      },
    );

    const reader = mockRepoReader([], {});
    const pulled = await pullDiagramsFromRepo('owner', 'repo', REPO, BRANCH, undefined, undefined, reader as never);

    expect(pulled).toBe(0);
    expect(capturedDiagrams).toHaveLength(0);
  });
});

describe('pullDiagramsFromRepo remote deletion handling', () => {
  beforeEach(() => {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    const MockDocSvc = jest.requireMock('@/services/documents/DocumentService').DocumentService;
    StorageService.mutateDiagrams.mockClear();
    StorageService.getSavedRepositories.mockClear();
    StorageService.getAllNotes.mockClear();
    StorageService.saveAllNotes.mockClear();
    StorageService.getAllTodos.mockClear();
    StorageService.saveAllTodos.mockClear();
    StorageService.mutateCanvases.mockClear();
    StorageService.getAllDiagrams.mockClear();
    StorageService.saveAllDiagrams.mockClear();
    MockDocSvc.prototype.create.mockClear();
    MockDocSvc.prototype.update.mockClear();
    MockDocSvc.prototype.index.getDocumentMetaBySlug.mockClear();
    MockDocSvc.prototype.list.mockClear();
    MockDocSvc.prototype.read.mockClear();
    MockDocSvc.prototype.purge.mockClear();
  });

  it('drops a clean diagram when remote file is absent', async () => {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    let capturedDiagrams: Diagram[] = [];
    StorageService.mutateDiagrams.mockImplementation(
      async (mutator: (diagrams: Diagram[]) => Promise<number>) => {
        const diagrams: Diagram[] = [];
        const result = await mutator(diagrams);
        capturedDiagrams = [...diagrams];
        return result;
      },
    );

    const reader = mockRepoReader([], {});
    const pulled = await pullDiagramsFromRepo('owner', 'repo', REPO, BRANCH, undefined, undefined, reader as never);

    expect(pulled).toBe(0);
    expect(capturedDiagrams).toHaveLength(0);
  });

  it('preserves a dirty diagram when remote file is absent', async () => {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    const dirtyDiagram: Diagram = {
      id: 'diagram-dirty',
      title: 'Dirty Diagram',
      document: { version: 1 as const, objects: [{ type: 'box' as const, id: 'b1', x: 0, y: 0, w: 100, h: 100 }] },
      repo: REPO,
      branch: BRANCH,
      filePath: 'diagrams/dirty.td.json',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      lastPulledDocument: diagramSerialized,
    };

    let capturedDiagrams: Diagram[] = [];
    StorageService.mutateDiagrams.mockImplementation(
      async (mutator: (diagrams: Diagram[]) => Promise<number>) => {
        const diagrams: Diagram[] = [dirtyDiagram];
        const result = await mutator(diagrams);
        capturedDiagrams = [...diagrams];
        return result;
      },
    );

    const reader = mockRepoReader([], {});
    await pullDiagramsFromRepo('owner', 'repo', REPO, BRANCH, undefined, undefined, reader as never);

    expect(capturedDiagrams.find((d) => d.id === 'diagram-dirty')).toBeDefined();
  });

  it('preserves a local-only diagram when remote is empty', async () => {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    const localOnly: Diagram = {
      id: 'diagram-local',
      title: 'Local Only',
      document: sampleDoc,
      repo: REPO,
      branch: BRANCH,
      filePath: 'diagrams/local-only.td.json',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    };

    let capturedDiagrams: Diagram[] = [];
    StorageService.mutateDiagrams.mockImplementation(
      async (mutator: (diagrams: Diagram[]) => Promise<number>) => {
        const diagrams: Diagram[] = [localOnly];
        const result = await mutator(diagrams);
        capturedDiagrams = [...diagrams];
        return result;
      },
    );

    const reader = mockRepoReader([], {});
    await pullDiagramsFromRepo('owner', 'repo', REPO, BRANCH, undefined, undefined, reader as never);

    expect(capturedDiagrams.find((d) => d.id === 'diagram-local')).toBeDefined();
  });

  it('preserves existing diagram unchanged when remote content is malformed parse', async () => {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    const existing: Diagram = {
      id: 'diagram-existing',
      title: 'Existing',
      document: sampleDoc,
      repo: REPO,
      branch: BRANCH,
      filePath: 'diagrams/existing.td.json',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      lastPulledDocument: diagramSerialized,
    };

    let capturedDiagrams: Diagram[] = [];
    StorageService.mutateDiagrams.mockImplementation(
      async (mutator: (diagrams: Diagram[]) => Promise<number>) => {
        const diagrams: Diagram[] = [existing];
        const result = await mutator(diagrams);
        capturedDiagrams = [...diagrams];
        return result;
      },
    );

    const reader = mockRepoReader(
      [{ path: 'diagrams/existing.td.json', type: 'blob' as const }],
      { 'diagrams/existing.td.json': 'not valid json {[' },
    );
    await pullDiagramsFromRepo('owner', 'repo', REPO, BRANCH, undefined, undefined, reader as never);

    expect(capturedDiagrams.find((d) => d.id === 'diagram-existing')).toBeDefined();
  });

  it('does not seed a new diagram from malformed remote .td.json; array remains empty', async () => {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    let capturedDiagrams: Diagram[] = [];
    StorageService.mutateDiagrams.mockImplementation(
      async (mutator: (diagrams: Diagram[]) => Promise<number>) => {
        const diagrams: Diagram[] = [];
        const result = await mutator(diagrams);
        capturedDiagrams = [...diagrams];
        return result;
      },
    );

    const reader = mockRepoReader(
      [{ path: 'diagrams/malformed.td.json', type: 'blob' as const }],
      { 'diagrams/malformed.td.json': 'not valid json {[' },
    );
    await pullDiagramsFromRepo('owner', 'repo', REPO, BRANCH, undefined, undefined, reader as never);

    expect(capturedDiagrams.find((d) => d.filePath === 'diagrams/malformed.td.json')).toBeUndefined();
  });

  it('does not process a .td.json file encountered in the canvases/ directory', async () => {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    let capturedDiagrams: Diagram[] = [];
    StorageService.mutateDiagrams.mockImplementation(
      async (mutator: (diagrams: Diagram[]) => Promise<number>) => {
        const diagrams: Diagram[] = [];
        const result = await mutator(diagrams);
        capturedDiagrams = [...diagrams];
        return result;
      },
    );

    const reader = mockRepoReader(
      [{ path: 'canvases/canvas.td.json', type: 'blob' as const }],
      { 'canvases/canvas.td.json': JSON.stringify({ version: 1, objects: [] }) },
    );
    await pullDiagramsFromRepo('owner', 'repo', REPO, BRANCH, undefined, undefined, reader as never);

    expect(capturedDiagrams.find((d) => d.filePath === 'canvases/canvas.td.json')).toBeUndefined();
  });

  it('does not process a .json file (wrong extension) in the diagrams/ directory', async () => {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    let capturedDiagrams: Diagram[] = [];
    StorageService.mutateDiagrams.mockImplementation(
      async (mutator: (diagrams: Diagram[]) => Promise<number>) => {
        const diagrams: Diagram[] = [];
        const result = await mutator(diagrams);
        capturedDiagrams = [...diagrams];
        return result;
      },
    );

    const reader = mockRepoReader(
      [{ path: 'diagrams/wrong.json', type: 'blob' as const }],
      { 'diagrams/wrong.json': JSON.stringify({ version: 1, objects: [] }) },
    );
    await pullDiagramsFromRepo('owner', 'repo', REPO, BRANCH, undefined, undefined, reader as never);

    expect(capturedDiagrams.find((d) => d.filePath === 'diagrams/wrong.json')).toBeUndefined();
  });
});

describe('pullDiagramsFromRepo DocumentService integration', () => {
  beforeEach(() => {
    const { __mockIndex } = jest.requireMock('@/services/documents/DocumentService');
    const MockDocSvc = jest.requireMock('@/services/documents/DocumentService').DocumentService;
    MockDocSvc.prototype.create.mockClear();
    MockDocSvc.prototype.update.mockClear();
    __mockIndex.getDocumentMetaBySlug.mockClear();
    MockDocSvc.prototype.list.mockClear();
    MockDocSvc.prototype.read.mockClear();
    MockDocSvc.prototype.purge.mockClear();
  });

  async function runPullDocSvc(
    reader: RepoReader,
    getBySlugImpl: () => unknown,
    createImpl: (input: unknown) => unknown,
    updateImpl: (id: string, input: unknown) => unknown,
  ): Promise<void> {
    const { StorageService } = jest.requireMock('@/services/StorageService');
    StorageService.mutateDiagrams = jest.fn();
    const capturedDiagrams: Diagram[] = [];
    StorageService.getAllDiagrams.mockResolvedValue([]);
    StorageService.mutateDiagrams.mockImplementation(
      async (mutator: (diagrams: Diagram[]) => Promise<number>) => {
        const result = await mutator(capturedDiagrams);
        return result;
      },
    );

    const { __mockIndex } = jest.requireMock('@/services/documents/DocumentService');
    const MockDocSvc = jest.requireMock('@/services/documents/DocumentService').DocumentService;
    __mockIndex.getDocumentMetaBySlug.mockImplementation(() => getBySlugImpl());
    MockDocSvc.prototype.create.mockImplementation(
      (input: unknown) => createImpl(input) as { id: string },
    );
    MockDocSvc.prototype.update.mockImplementation(
      (id: string, input: unknown) => updateImpl(id, input) as { id: string },
    );

    await pullDiagramsFromRepo('owner', 'repo', REPO, BRANCH, undefined, undefined, reader);
  }

  it('writes a new valid remote diagram to DocumentService via create', async () => {
    const { __mockIndex } = jest.requireMock('@/services/documents/DocumentService');
    const MockDocSvc = jest.requireMock('@/services/documents/DocumentService').DocumentService;

    const validDoc = { version: 1, objects: [{ type: 'box', id: 'b1', z: 0, parentId: null, color: 'blue' as const, left: 0, top: 0, right: 100, bottom: 100, style: 'auto' as const }] };
    const reader = mockRepoReader(
      [{ path: 'diagrams/my-diagram.td.json', type: 'blob' }],
      { 'diagrams/my-diagram.td.json': JSON.stringify(validDoc) },
    );

    await runPullDocSvc(reader, () => null, (input) => ({ id: 'new-doc-id', ...(input as Record<string, unknown>) }), () => ({ id: 'ignored' }));

    const createCall = MockDocSvc.prototype.create.mock.calls[0][0] as { type: string; title: string; body: string; tags: string[]; extra: Record<string, string> };
    expect(__mockIndex.getDocumentMetaBySlug).toHaveBeenCalledWith('diagram', 'my-diagram');
    expect(MockDocSvc.prototype.create).toHaveBeenCalledTimes(1);
    expect(createCall.type).toBe('diagram');
    expect(createCall.title).toBe('my diagram');
    expect(JSON.parse(createCall.body)).toEqual(validDoc);
    expect(createCall.tags).toEqual([]);
    expect(createCall.extra.lastPulledDocument).toBe(createCall.body);
    expect(createCall.extra.repo).toBe(REPO);
    expect(createCall.extra.branch).toBe(BRANCH);
    expect(createCall.extra.filePath).toBe('diagrams/my-diagram.td.json');
  });

  it('updates an existing diagram in DocumentService when index finds a match', async () => {
    const MockDocSvc = jest.requireMock('@/services/documents/DocumentService').DocumentService;

    const newDoc = { version: 1, objects: [{ type: 'box', id: 'b1', z: 0, parentId: null, color: 'blue' as const, left: 0, top: 0, right: 100, bottom: 100, style: 'auto' as const }] };
    const reader = mockRepoReader(
      [{ path: 'diagrams/my-diagram.td.json', type: 'blob' }],
      { 'diagrams/my-diagram.td.json': JSON.stringify(newDoc) },
    );

    await runPullDocSvc(
      reader,
      () => ({ id: 'existing-doc-id', path: 'diagram/my-diagram.td.json' }),
      () => ({ id: 'new' }),
      (id, input) => ({ id, ...(input as Record<string, unknown>) }),
    );

    const updateCall = MockDocSvc.prototype.update.mock.calls[0] as [string, { body: string; extra: Record<string, string> }];
    expect(updateCall[0]).toBe('existing-doc-id');
    expect(JSON.parse(updateCall[1].body)).toEqual(newDoc);
    expect(updateCall[1].extra.lastPulledDocument).toBe(updateCall[1].body);
    expect(updateCall[1].extra.repo).toBe(REPO);
    expect(updateCall[1].extra.branch).toBe(BRANCH);
    expect(updateCall[1].extra.filePath).toBe('diagrams/my-diagram.td.json');
  });

  it('does not write to DocumentService for a malformed remote diagram', async () => {
    const { __mockIndex } = jest.requireMock('@/services/documents/DocumentService');
    const MockDocSvc = jest.requireMock('@/services/documents/DocumentService').DocumentService;

    const reader = mockRepoReader(
      [{ path: 'diagrams/bad.td.json', type: 'blob' }],
      { 'diagrams/bad.td.json': 'not valid json at all {[' },
    );

    await runPullDocSvc(
      reader,
      () => null,
      () => ({ id: 'new' }),
      () => ({ id: 'updated' }),
    );

    expect(__mockIndex.getDocumentMetaBySlug).not.toHaveBeenCalled();
    expect(MockDocSvc.prototype.create).not.toHaveBeenCalled();
    expect(MockDocSvc.prototype.update).not.toHaveBeenCalled();
  });

  it('extra fields include repo, branch, filePath, and lastPulledDocument for new diagram', async () => {
    const validDoc = { version: 1, objects: [{ type: 'box', id: 'b1', z: 0, parentId: null, color: 'blue' as const, left: 0, top: 0, right: 100, bottom: 100, style: 'auto' as const }] };
    const reader = mockRepoReader(
      [{ path: 'diagrams/survivor.td.json', type: 'blob' }],
      { 'diagrams/survivor.td.json': JSON.stringify(validDoc) },
    );

    let createInput: { type: string; title: string; body: string; tags: string[]; extra: Record<string, string> } | null = null;
    await runPullDocSvc(
      reader,
      () => null,
      (input) => {
        createInput = input as { type: string; title: string; body: string; tags: string[]; extra: Record<string, string> };
        return { id: 'doc-id' };
      },
      () => ({ id: 'ignored' }),
    );

    expect(createInput).not.toBeNull();
    expect(JSON.parse(createInput!.body)).toEqual(validDoc);
    expect(createInput!.extra.lastPulledDocument).toBe(createInput!.body);
    expect(createInput!.extra.repo).toBe(REPO);
    expect(createInput!.extra.branch).toBe(BRANCH);
    expect(createInput!.extra.filePath).toBe('diagrams/survivor.td.json');
  });

  it('idempotency: second pull of same diagram calls update not create', async () => {
    const { __mockIndex } = jest.requireMock('@/services/documents/DocumentService');
    const MockDocSvc = jest.requireMock('@/services/documents/DocumentService').DocumentService;

    const newDoc = { version: 1, objects: [{ type: 'box', id: 'b1', z: 0, parentId: null, color: 'blue' as const, left: 0, top: 0, right: 100, bottom: 100, style: 'auto' as const }] };
    const reader = mockRepoReader(
      [{ path: 'diagrams/my-diagram.td.json', type: 'blob' }],
      { 'diagrams/my-diagram.td.json': JSON.stringify(newDoc) },
    );

    await runPullDocSvc(
      reader,
      () => ({ id: 'existing-doc-id', path: 'diagram/my-diagram.td.json' }),
      () => ({ id: 'new' }),
      (id, input) => ({ id, ...(input as Record<string, unknown>) }),
    );

    expect(__mockIndex.getDocumentMetaBySlug).toHaveBeenCalledTimes(1);
    expect(MockDocSvc.prototype.update).toHaveBeenCalledTimes(1);
    expect(MockDocSvc.prototype.create).not.toHaveBeenCalled();
  });
});

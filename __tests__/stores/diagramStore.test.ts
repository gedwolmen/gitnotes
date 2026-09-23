import type { Diagram } from '@/models/Diagram';
import { createDiagramDocument } from '@/models/Diagram';
import { CloneSyncService } from '@/services/cloneSyncServiceImpl';
import { useDiagramStore } from '@/stores/diagramStore';

const mockRead = jest.fn();
const mockPurge = jest.fn();
const mockList = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@/services/cloneSyncServiceImpl', () => ({
  CloneSyncService: { save: jest.fn() },
}));

jest.mock('@/services/git/resolveBranch', () => ({
  resolveBranch: jest.fn().mockResolvedValue('main'),
}));

jest.mock('@/services/documents/DocumentService', () => ({
  DocumentService: jest.fn().mockImplementation(() => ({
    read: mockRead,
    purge: mockPurge,
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
  })),
}));

const diagram: Diagram = {
  id: 'diagram-1',
  title: 'Example Diagram',
  document: createDiagramDocument(),
  tags: [],
  repo: 'owner/repo',
  branch: 'main',
  filePath: 'diagrams/example-diagram.td.json',
  createdAt: 1,
  updatedAt: 1,
};

const diagramDocument = {
  id: diagram.id,
  title: diagram.title,
  body: JSON.stringify(diagram.document),
  raw: '---\n---\n' + JSON.stringify(diagram.document),
  tags: [],
  createdAt: diagram.createdAt,
  updatedAt: diagram.updatedAt,
};

describe('diagramStore delete flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDiagramStore.setState({ diagrams: [], isLoading: false, error: null });
    mockRead.mockResolvedValue(diagramDocument);
    mockPurge.mockResolvedValue(undefined);
    (CloneSyncService.save as jest.Mock).mockResolvedValue({ success: true });
  });

  it('writes a repo-backed diagram deletion to the clone before purging locally', async () => {
    useDiagramStore.setState({ diagrams: [diagram] });

    await expect(useDiagramStore.getState().deleteDiagram(diagram.id)).resolves.toBe(true);

    expect(CloneSyncService.save).toHaveBeenCalledWith({
      repoPath: diagram.repo,
      branch: diagram.branch,
      filePath: diagram.filePath,
      message: 'Delete diagram: Example Diagram',
      intent: 'delete',
    });
    expect(mockPurge).toHaveBeenCalledWith(diagram.id);
    expect(useDiagramStore.getState().diagrams).toEqual([]);
  });

  it('purges a local-only diagram without a clone operation', async () => {
    const localDiagram = { ...diagram, repo: undefined, branch: undefined, filePath: undefined };
    useDiagramStore.setState({ diagrams: [localDiagram] });

    await expect(useDiagramStore.getState().deleteDiagram(localDiagram.id)).resolves.toBe(true);

    expect(CloneSyncService.save).not.toHaveBeenCalled();
    expect(mockPurge).toHaveBeenCalledWith(localDiagram.id);
  });

  it('restores Git metadata from document frontmatter when loading diagrams', async () => {
    mockList.mockResolvedValue([{ id: diagram.id }]);
    mockRead.mockResolvedValue({
      ...diagramDocument,
      raw: [
        '---',
        'repo: "owner/repo"',
        'branch: "main"',
        'filePath: "diagrams/example-diagram.td.json"',
        '---',
        diagramDocument.body,
      ].join('\n'),
    });

    await useDiagramStore.getState().loadDiagrams();

    expect(useDiagramStore.getState().diagrams[0]).toEqual(expect.objectContaining({
      repo: diagram.repo,
      branch: diagram.branch,
      filePath: diagram.filePath,
    }));
  });

  it('creates a new diagram with correct type and body', async () => {
    const newDoc = createDiagramDocument();
    mockCreate.mockResolvedValue({
      ...diagramDocument,
      id: 'diagram-new',
      title: 'New Diagram',
      body: JSON.stringify(newDoc),
    });

    await useDiagramStore.getState().createDiagram({
      title: 'New Diagram',
      document: newDoc,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      type: 'diagram',
      title: 'New Diagram',
      body: JSON.stringify(newDoc, null, 2),
      tags: [],
      extra: {
        repo: undefined,
        branch: undefined,
        filePath: undefined,
        accountId: undefined,
      },
    });
  });
});

describe('diagramStore update flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDiagramStore.setState({ diagrams: [diagram], isLoading: false, error: null });
    mockUpdate.mockResolvedValue(undefined);
  });

  it('updates diagram title and syncs to document service', async () => {
    await useDiagramStore.getState().updateDiagram({
      id: diagram.id,
      title: 'Updated Title',
    });

    expect(mockUpdate).toHaveBeenCalledWith(diagram.id, expect.objectContaining({
      title: 'Updated Title',
    }));
  });

  it('preserves existing metadata when updating only title', async () => {
    const updated = await useDiagramStore.getState().updateDiagram({
      id: diagram.id,
      title: 'New Title',
    });

    expect(updated).toEqual(expect.objectContaining({
      title: 'New Title',
      repo: diagram.repo,
      branch: diagram.branch,
      filePath: diagram.filePath,
    }));
  });
});

describe('diagramStore malformed document handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDiagramStore.setState({ diagrams: [], isLoading: false, error: null });
  });

  it('skips diagram with malformed body and surfaces an actionable error', async () => {
    mockList.mockResolvedValue([{ id: diagram.id }]);
    mockRead.mockResolvedValue({
      ...diagramDocument,
      body: 'not valid json {',
    });

    await useDiagramStore.getState().loadDiagrams();

    const { diagrams, error } = useDiagramStore.getState();
    expect(diagrams.find((d) => d.id === diagram.id)).toBeUndefined();
    expect(error).toContain('Failed to parse 1 diagram(s)');
    expect(error).toContain('JSON parse failed');
  });

  it('preserves previously loaded valid diagram when another diagram fails to parse', async () => {
    const validDoc = { ...diagram, id: 'diagram-valid' };
    mockList.mockResolvedValue([
      { id: 'diagram-valid' },
      { id: 'diagram-bad' },
    ]);
    mockRead.mockImplementation(async (id: string) => {
      if (id === 'diagram-valid') {
        return {
          ...diagramDocument,
          id: 'diagram-valid',
          body: JSON.stringify(validDoc.document),
          raw: '---\n---\n' + JSON.stringify(validDoc.document),
        };
      }
      return {
        ...diagramDocument,
        id: 'diagram-bad',
        body: 'malformed',
        raw: '---\n---\nmalformed',
      };
    });

    await useDiagramStore.getState().loadDiagrams();

    const { diagrams, error } = useDiagramStore.getState();
    expect(diagrams.find((d) => d.id === 'diagram-valid')).toBeDefined();
    expect(diagrams.find((d) => d.id === 'diagram-bad')).toBeUndefined();
    expect(error).toContain('diagram-bad');
  });
});

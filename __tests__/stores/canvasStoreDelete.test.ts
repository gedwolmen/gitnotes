import type { Canvas } from '@/models/Canvas';
import { CloneSyncService } from '@/services/cloneSyncServiceImpl';
import { useCanvasStore } from '@/stores/canvasStore';

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

const canvas: Canvas = {
  id: 'canvas-1',
  title: 'Example',
  scene: { version: 1, width: 800, height: 600, background: '#FFFFFF', elements: [] },
  tags: [],
  repo: 'owner/repo',
  branch: 'main',
  filePath: 'canvases/example.json',
  createdAt: 1,
  updatedAt: 1,
};

const document = {
  id: canvas.id,
  title: canvas.title,
  body: JSON.stringify(canvas.scene),
  raw: '---\n---\n' + JSON.stringify(canvas.scene),
  tags: [],
  createdAt: canvas.createdAt,
  updatedAt: canvas.updatedAt,
};

describe('canvasStore delete flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCanvasStore.setState({ canvases: [], isLoading: false, error: null });
    mockRead.mockResolvedValue(document);
    mockPurge.mockResolvedValue(undefined);
    (CloneSyncService.save as jest.Mock).mockResolvedValue({ success: true });
  });

  it('writes a repo-backed canvas deletion to the clone before purging locally', async () => {
    useCanvasStore.setState({ canvases: [canvas] });

    await expect(useCanvasStore.getState().deleteCanvas(canvas.id)).resolves.toBe(true);

    expect(CloneSyncService.save).toHaveBeenCalledWith({
      repoPath: canvas.repo,
      branch: canvas.branch,
      filePath: canvas.filePath,
      message: 'Delete canvas: Example',
      intent: 'delete',
    });
    expect(mockPurge).toHaveBeenCalledWith(canvas.id);
    expect(useCanvasStore.getState().canvases).toEqual([]);
  });

  it('purges a local-only canvas without a clone operation', async () => {
    const localCanvas = { ...canvas, repo: undefined, branch: undefined, filePath: undefined };
    useCanvasStore.setState({ canvases: [localCanvas] });

    await expect(useCanvasStore.getState().deleteCanvas(localCanvas.id)).resolves.toBe(true);

    expect(CloneSyncService.save).not.toHaveBeenCalled();
    expect(mockPurge).toHaveBeenCalledWith(localCanvas.id);
  });

  it('restores Git metadata from document frontmatter when loading canvases', async () => {
    mockList.mockResolvedValue([{ id: canvas.id }]);
    mockRead.mockResolvedValue({
      ...document,
      raw: [
        '---',
        'repo: "owner/repo"',
        'branch: "main"',
        'filePath: "canvases/example.json"',
        '---',
        document.body,
      ].join('\n'),
    });

    await useCanvasStore.getState().loadCanvases();

    expect(useCanvasStore.getState().canvases[0]).toEqual(expect.objectContaining({
      repo: canvas.repo,
      branch: canvas.branch,
      filePath: canvas.filePath,
    }));
  });
});

jest.mock('expo-file-system/legacy', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    documentDirectory: '/test-docs/',
    readAsStringAsync: jest.fn(async (uri: string) => {
      const val = store.get(uri);
      if (val === undefined) throw new Error('ENOENT');
      return val;
    }),
    writeAsStringAsync: jest.fn(async (uri: string, content: string) => {
      store.set(uri, content);
    }),
    __store: store,
  };
});

jest.mock('react-native', () => ({
  InteractionManager: {
    runAfterInteractions: jest.fn((cb: () => void) => {
      cb();
      return { then: (fn: () => void) => { fn(); return { cancel: () => {} }; }, cancel: () => {} };
    }),
  },
}));

jest.mock('../../src/services/ai/AIMemoryIndexService', () => {
  const upsert = jest.fn(async () => {});
  const remove = jest.fn(async () => {});
  const clear = jest.fn(async () => {});
  const isStale = jest.fn(() => false);
  const embed = jest.fn(async (texts: string[]) => texts.map(() => [0.5, 0.5]));
  return {
    aiMemoryIndex: { upsert, remove, clear, isStale, embed },
    AIMemoryIndexService: jest.fn(() => ({ upsert, remove, clear, isStale, embed })),
  };
});

jest.mock('../../src/services/ThoughtDumpService', () => ({
  ThoughtDumpService: {
    list: jest.fn(async () => []),
  },
}));

import * as FileSystem from 'expo-file-system/legacy';
import { aiMemoryIndex } from '../../src/services/ai/AIMemoryIndexService';
import { ThoughtDumpService } from '../../src/services/ThoughtDumpService';
import {
  indexDump,
  removeDump,
  reconcile,
  loadManifest,
  simpleHash,
} from '../../src/services/ai/thoughtDumpIndexing';
import type { ThoughtDump } from '../../src/models/ThoughtDump';

const fsStore = (FileSystem as unknown as { __store: Map<string, string> }).__store;

function makeDump(overrides: Partial<ThoughtDump> = {}): ThoughtDump {
  return {
    id: 'test-id',
    text: 'test thought',
    createdAt: '2024-01-01T00:00:00.000Z',
    filePath: 'thoughts/20240101-000000-test-id.md',
    ...overrides,
  };
}

beforeEach(() => {
  fsStore.clear();
  jest.clearAllMocks();
  (aiMemoryIndex.isStale as jest.Mock).mockReturnValue(false);
  (ThoughtDumpService.list as jest.Mock).mockResolvedValue([]);
});

describe('indexDump', () => {
  it('calls AIMemoryIndexService.upsert with filePath and text', async () => {
    const dump = makeDump();
    indexDump(dump);

    await new Promise((r) => setTimeout(r, 50));

    expect(aiMemoryIndex.upsert).toHaveBeenCalledTimes(1);
    expect(aiMemoryIndex.upsert).toHaveBeenCalledWith(dump.filePath, dump.text);
  });

  it('persists manifest entry with hash', async () => {
    const dump = makeDump();
    indexDump(dump);

    await new Promise((r) => setTimeout(r, 50));

    const manifest = await loadManifest();
    expect(manifest.entries[dump.filePath]).toBeDefined();
    expect(manifest.entries[dump.filePath].hash).toBe(simpleHash(dump.text));
  });
});

describe('removeDump', () => {
  it('calls AIMemoryIndexService.remove with filePath', async () => {
    const dump = makeDump();
    removeDump(dump.filePath);

    await new Promise((r) => setTimeout(r, 50));

    expect(aiMemoryIndex.remove).toHaveBeenCalledTimes(1);
    expect(aiMemoryIndex.remove).toHaveBeenCalledWith(dump.filePath);
  });

  it('removes manifest entry', async () => {
    const dump = makeDump();
    indexDump(dump);
    await new Promise((r) => setTimeout(r, 50));

    removeDump(dump.filePath);
    await new Promise((r) => setTimeout(r, 50));

    const manifest = await loadManifest();
    expect(manifest.entries[dump.filePath]).toBeUndefined();
  });
});

describe('reconcile', () => {
  it('upserts repo-only file missing from index', async () => {
    const repoDump = makeDump({
      id: 'repo-only',
      text: 'repo only thought',
      filePath: 'thoughts/repo-only.md',
    });
    (ThoughtDumpService.list as jest.Mock).mockResolvedValue([repoDump]);

    await reconcile();

    expect(aiMemoryIndex.upsert).toHaveBeenCalledWith(repoDump.filePath, repoDump.text);
  });

  it('removes orphaned index entry not in repo', async () => {
    const orphanDump = makeDump({
      id: 'orphan',
      text: 'orphan thought',
      filePath: 'thoughts/orphan.md',
    });
    indexDump(orphanDump);
    await new Promise((r) => setTimeout(r, 50));

    (ThoughtDumpService.list as jest.Mock).mockResolvedValue([]);
    (aiMemoryIndex.isStale as jest.Mock).mockReturnValue(false);

    await reconcile();

    expect(aiMemoryIndex.remove).toHaveBeenCalledWith('thoughts/orphan.md');
  });

  it('adds repo-only file and drops index-only file in same reconcile', async () => {
    const orphanDump = makeDump({
      id: 'orphan',
      text: 'orphan thought',
      filePath: 'thoughts/orphan.md',
    });
    indexDump(orphanDump);
    await new Promise((r) => setTimeout(r, 50));

    const repoDump = makeDump({
      id: 'new-repo',
      text: 'new repo thought',
      filePath: 'thoughts/new-repo.md',
    });
    (ThoughtDumpService.list as jest.Mock).mockResolvedValue([repoDump]);
    (aiMemoryIndex.isStale as jest.Mock).mockReturnValue(false);

    await reconcile();

    expect(aiMemoryIndex.upsert).toHaveBeenCalledWith('thoughts/new-repo.md', 'new repo thought');
    expect(aiMemoryIndex.remove).toHaveBeenCalledWith('thoughts/orphan.md');
  });

  it('performs full rebuild when isStale returns true and reconcile cannot fix it', async () => {
    const dump1 = makeDump({ id: 'd1', text: 'first', filePath: 'thoughts/d1.md' });
    const dump2 = makeDump({ id: 'd2', text: 'second', filePath: 'thoughts/d2.md' });
    (ThoughtDumpService.list as jest.Mock).mockResolvedValue([dump1, dump2]);
    (aiMemoryIndex.isStale as jest.Mock).mockReturnValue(true);

    await reconcile();

    expect(aiMemoryIndex.clear).toHaveBeenCalled();
    expect(aiMemoryIndex.upsert).toHaveBeenCalledWith('thoughts/d1.md', 'first');
    expect(aiMemoryIndex.upsert).toHaveBeenCalledWith('thoughts/d2.md', 'second');
  });

  it('second launch with unchanged manifest performs zero embed calls', async () => {
    const dump = makeDump({
      id: 'stable',
      text: 'stable thought',
      filePath: 'thoughts/stable.md',
    });

    (ThoughtDumpService.list as jest.Mock).mockResolvedValue([dump]);
    (aiMemoryIndex.isStale as jest.Mock).mockReturnValue(false);

    await reconcile();

    const embedCallCountAfterFirst = (aiMemoryIndex.upsert as jest.Mock).mock.calls.length;
    expect(embedCallCountAfterFirst).toBe(1);

    (aiMemoryIndex.upsert as jest.Mock).mockClear();
    (aiMemoryIndex.isStale as jest.Mock).mockReturnValue(false);

    await reconcile();

    expect(aiMemoryIndex.upsert).not.toHaveBeenCalled();
  });
});

describe('simpleHash', () => {
  it('returns consistent hash for same input', () => {
    expect(simpleHash('hello')).toBe(simpleHash('hello'));
  });

  it('returns different hash for different input', () => {
    expect(simpleHash('hello')).not.toBe(simpleHash('world'));
  });
});

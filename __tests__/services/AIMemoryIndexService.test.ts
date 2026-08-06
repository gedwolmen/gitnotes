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
    getInfoAsync: jest.fn(async (uri: string) => ({
      exists: store.has(uri),
    })),
    __store: store,
  };
});

jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(() => {
    throw new Error('provider unavailable');
  }),
}));

jest.mock('llama.rn', () => ({
  initContext: jest.fn(async () => {
    throw new Error('llama unavailable');
  }),
}));

jest.mock('../../src/services/ai/providerQuirks', () => ({
  buildQuirkedFetch: jest.fn(() => null),
}));

import * as FileSystem from 'expo-file-system/legacy';
import { AIMemoryIndexService } from '../../src/services/ai/AIMemoryIndexService';

const fsStore = (FileSystem as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  fsStore.clear();
  jest.restoreAllMocks();
  (globalThis.fetch as jest.Mock | undefined) = jest.fn();
});

describe('AIMemoryIndexService', () => {
  describe('with mock embedder', () => {
    it('upsert and search returns nearest match', async () => {
      const service = new AIMemoryIndexService();

      jest.spyOn(service, 'embed').mockImplementation(async (texts: string[]) => {
        return texts.map((text) => {
          if (text.includes('cat')) return [1, 0, 0];
          if (text.includes('dog')) return [0, 1, 0];
          if (text.includes('fish')) return [0, 0, 1];
          return [0.1, 0.1, 0.1];
        });
      });

      await service.upsert('cats.md', 'I love cats and kittens');
      await service.upsert('dogs.md', 'Dogs are loyal friends');
      await service.upsert('fish.md', 'Fish swim in the ocean');

      const results = await service.search('cat is cute', 2);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].filePath).toBe('cats.md');
      expect(results[0].score).toBe(1);
    });

    it('search returns top-k results sorted by score', async () => {
      const service = new AIMemoryIndexService();

      jest.spyOn(service, 'embed').mockImplementation(async (texts: string[]) => {
        return texts.map((text) => {
          if (text.includes('cat')) return [1, 0, 0];
          if (text.includes('dog')) return [0.5, 0.5, 0];
          if (text.includes('fish')) return [0, 0, 1];
          return [0.1, 0.1, 0.1];
        });
      });

      await service.upsert('cats.md', 'cats are fluffy');
      await service.upsert('dogs.md', 'dogs are loyal');
      await service.upsert('fish.md', 'fish are aquatic');

      const results = await service.search('cat', 1);
      expect(results).toHaveLength(1);
      expect(results[0].filePath).toBe('cats.md');
    });
  });

  describe('lexical fallback', () => {
    it('returns keyword match without network calls', async () => {
      const service = new AIMemoryIndexService();

      const fetchMock = globalThis.fetch as jest.Mock;
      fetchMock.mockClear();

      await service.resolveEmbedder([], undefined);

      await service.upsert('notes.md', 'TypeScript interfaces and generics are powerful');
      await service.upsert('other.md', 'Cooking recipes for pasta and pizza');

      const results = await service.search('TypeScript generics', 2);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].filePath).toBe('notes.md');
      expect(results[0].score).toBeGreaterThan(0);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('clear()', () => {
    it('empties the index', async () => {
      const service = new AIMemoryIndexService();

      jest.spyOn(service, 'embed').mockResolvedValue([[1, 0, 0]]);

      await service.upsert('file.md', 'some content');
      expect(service.getEntryCount()).toBeGreaterThan(0);

      await service.clear();
      expect(service.getEntryCount()).toBe(0);
      expect(service.getIndexedFilePaths()).toEqual([]);

      const results = await service.search('anything', 5);
      expect(results).toEqual([]);
    });
  });

  describe('isStale()', () => {
    it('returns true when index is empty', () => {
      const service = new AIMemoryIndexService();
      expect(service.isStale(['a.md'])).toBe(true);
    });

    it('returns true when file set has mismatch', async () => {
      const service = new AIMemoryIndexService();

      jest.spyOn(service, 'embed').mockResolvedValue([[1, 0, 0]]);

      await service.upsert('a.md', 'content a');
      await service.upsert('b.md', 'content b');

      expect(service.isStale(['a.md', 'b.md'])).toBe(false);
      expect(service.isStale(['a.md'])).toBe(true);
      expect(service.isStale(['a.md', 'b.md', 'c.md'])).toBe(true);
    });

    it('returns false when file sets match', async () => {
      const service = new AIMemoryIndexService();

      jest.spyOn(service, 'embed').mockResolvedValue([[1, 0, 0]]);

      await service.upsert('x.md', 'hello');
      await service.upsert('y.md', 'world');

      expect(service.isStale(['x.md', 'y.md'])).toBe(false);
    });
  });

  describe('remove()', () => {
    it('removes entries for a file path', async () => {
      const service = new AIMemoryIndexService();

      jest.spyOn(service, 'embed').mockResolvedValue([[1, 0, 0]]);

      await service.upsert('a.md', 'keep me');
      await service.upsert('b.md', 'remove me');

      await service.remove('b.md');
      expect(service.getIndexedFilePaths()).toEqual(['a.md']);

      const results = await service.search('remove', 5);
      expect(results.every((r) => r.filePath !== 'b.md')).toBe(true);
    });
  });

  describe('chunking', () => {
    it('creates chunk entries for long text', async () => {
      const service = new AIMemoryIndexService();
      const longText = 'a'.repeat(1200);

      let embedCallCount = 0;
      jest.spyOn(service, 'embed').mockImplementation(async (texts: string[]) => {
        embedCallCount++;
        return texts.map(() => [0.5, 0.5, 0.5]);
      });

      await service.upsert('long.md', longText);

      expect(service.getEntryCount()).toBeGreaterThan(1);
      expect(embedCallCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('persistence', () => {
    it('survives load/unload cycle', async () => {
      const service1 = new AIMemoryIndexService();

      jest.spyOn(service1, 'embed').mockResolvedValue([[1, 0, 0]]);

      await service1.upsert('persist.md', 'persistent content');

      const service2 = new AIMemoryIndexService();
      await service2.load();
      expect(service2.getIndexedFilePaths()).toEqual(['persist.md']);
    });
  });
});

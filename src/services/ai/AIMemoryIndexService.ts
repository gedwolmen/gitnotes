import { embedMany } from 'ai';
import type { EmbeddingModel } from 'ai';
import * as FileSystem from 'expo-file-system/legacy';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AIProviderConfig, AIModelConfig } from '../../models/AIProvider';
import { buildQuirkedFetch } from './providerQuirks';

interface IndexEntry {
  filePath: string;
  vector: number[];
  snippet: string;
  chunkIndex: number;
}

interface PersistedIndex {
  version: 1;
  entries: IndexEntry[];
  filePaths: string[];
  updatedAt: number;
}

export interface MemorySearchResult {
  filePath: string;
  snippet: string;
  score: number;
}

const CHUNK_SIZE = 500;
const YIELD_THRESHOLD = 2000;
const INDEX_FILENAME = 'ai-memory-index.json';

function getIndexUri(): string {
  return `${FileSystem.documentDirectory}${INDEX_FILENAME}`;
}

function yieldThread(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof setImmediate !== 'undefined') {
      setImmediate(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function lexicalEmbed(text: string, vocab: Map<string, number>): number[] {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  const vec = new Array(vocab.size).fill(0);
  for (const [token, count] of tf) {
    const idx = vocab.get(token);
    if (idx !== undefined) {
      vec[idx] = count / tokens.length;
    }
  }
  return vec;
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

export class AIMemoryIndexService {
  private entries: IndexEntry[] = [];
  private filePaths: Set<string> = new Set();
  private loaded = false;
  private embedMode: 'openai' | 'llama' | 'lexical' = 'lexical';
  private embeddingModel: EmbeddingModel | null = null;
  private llamaContext: unknown = null;
  private vocab: Map<string, number> = new Map();
  private vocabDirty = false;

  async resolveEmbedder(
    providers: AIProviderConfig[],
    selectedModel?: AIModelConfig,
  ): Promise<void> {
    for (const provider of providers) {
      // Anthropic does not provide embedding models — only openai-compatible providers have /v1/embeddings
      if (!provider.isEnabled || provider.type !== 'openai-compatible') continue;
      if (!provider.baseURL || !provider.apiKey) continue;

      try {
        const quirkedFetch = buildQuirkedFetch(provider.baseURL);
        const p = createOpenAICompatible({
          name: provider.id,
          baseURL: provider.baseURL,
          apiKey: provider.apiKey,
          ...(quirkedFetch ? { fetch: quirkedFetch } : {}),
        });
        const model = p.embeddingModel('text-embedding-3-small');
        this.embeddingModel = model as EmbeddingModel;
        this.embedMode = 'openai';
        return;
      } catch {
        continue;
      }
    }

    if (selectedModel?.providerType === 'llama' && selectedModel.isDownloaded) {
      try {
        const llamaModule = await import('llama.rn');
        const ctx = await llamaModule.initLlama({
          model: selectedModel.id,
          embedding: true,
        });
        this.llamaContext = ctx;
        this.embedMode = 'llama';
        return;
      } catch {
        // fall through to lexical
      }
    }

    this.embedMode = 'lexical';
    this.embeddingModel = null;
    this.llamaContext = null;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (this.embedMode === 'openai' && this.embeddingModel) {
      try {
        const { embeddings } = await embedMany({
          model: this.embeddingModel,
          values: texts,
        });
        return embeddings;
      } catch {
        this.embedMode = 'lexical';
      }
    }

    if (this.embedMode === 'llama' && this.llamaContext) {
      try {
        const ctx = this.llamaContext as { embedding: (text: string) => Promise<{ embedding: number[] }> };
        const results: number[][] = [];
        for (const text of texts) {
          const result = await ctx.embedding(text);
          results.push(result.embedding);
        }
        return results;
      } catch {
        this.embedMode = 'lexical';
      }
    }

    this.rebuildVocabIfNeeded(texts);
    return texts.map((t) => lexicalEmbed(t, this.vocab));
  }

  private rebuildVocabIfNeeded(texts: string[]): void {
    if (!this.vocabDirty && this.vocab.size > 0) return;
    this.vocab.clear();
    let idx = 0;
    for (const text of texts) {
      for (const token of tokenize(text)) {
        if (!this.vocab.has(token)) {
          this.vocab.set(token, idx++);
        }
      }
    }
    for (const entry of this.entries) {
      for (const token of tokenize(entry.snippet)) {
        if (!this.vocab.has(token)) {
          this.vocab.set(token, idx++);
        }
      }
    }
    this.vocabDirty = false;
  }

  private async embedSingle(text: string): Promise<number[]> {
    const [vec] = await this.embed([text]);
    return vec;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const uri = getIndexUri();
      const raw = await FileSystem.readAsStringAsync(uri);
      const data: PersistedIndex = JSON.parse(raw);
      this.entries = data.entries;
      this.filePaths = new Set(data.filePaths);
      this.loaded = true;
    } catch {
      this.entries = [];
      this.filePaths = new Set();
      this.loaded = true;
    }
  }

  private async persist(): Promise<void> {
    const data: PersistedIndex = {
      version: 1,
      entries: this.entries,
      filePaths: Array.from(this.filePaths),
      updatedAt: Date.now(),
    };
    const uri = getIndexUri();
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(data));
  }

  async upsert(filePath: string, text: string, embedding?: number[]): Promise<void> {
    await this.load();
    this.entries = this.entries.filter((e) => e.filePath !== filePath);

    const chunks = chunkText(text);
    const vectors: number[][] = [];

    if (embedding && chunks.length === 1) {
      vectors.push(embedding);
    } else {
      const fullVec = embedding ?? (await this.embedSingle(text));
      vectors.push(fullVec);

      if (chunks.length > 1) {
        const chunkVecs = await this.embed(chunks);
        vectors.push(...chunkVecs);
      }
    }

    const newEntries: IndexEntry[] = [];
    newEntries.push({
      filePath,
      vector: vectors[0],
      snippet: text.slice(0, CHUNK_SIZE),
      chunkIndex: -1,
    });

    if (chunks.length > 1) {
      for (let i = 0; i < chunks.length; i++) {
        newEntries.push({
          filePath,
          vector: vectors[i + 1],
          snippet: chunks[i],
          chunkIndex: i,
        });
      }
    }

    this.entries.push(...newEntries);
    this.filePaths.add(filePath);
    this.vocabDirty = true;
    await this.persist();
  }

  async remove(filePath: string): Promise<void> {
    await this.load();
    this.entries = this.entries.filter((e) => e.filePath !== filePath);
    this.filePaths.delete(filePath);
    this.vocabDirty = true;
    await this.persist();
  }

  async clear(): Promise<void> {
    this.entries = [];
    this.filePaths = new Set();
    this.vocab.clear();
    this.vocabDirty = false;
    await this.persist();
  }

  isStale(activeFilePaths: string[]): boolean {
    if (this.entries.length === 0) return true;
    const activeSet = new Set(activeFilePaths);
    if (activeSet.size !== this.filePaths.size) return true;
    for (const fp of this.filePaths) {
      if (!activeSet.has(fp)) return true;
    }
    return false;
  }

  async search(query: string, k: number): Promise<MemorySearchResult[]> {
    await this.load();
    if (this.entries.length === 0) return [];

    const isLexical = this.embedMode === 'lexical';
    const allSnippets = this.entries.map((e) => e.snippet);

    let queryVec: number[];
    let entryVecs: number[][];

    if (isLexical) {
      this.rebuildVocab([...allSnippets, query]);
      const allVecs = await this.embed([...allSnippets, query]);
      entryVecs = allVecs.slice(0, -1);
      queryVec = allVecs[allVecs.length - 1];
    } else {
      queryVec = await this.embedSingle(query);
      entryVecs = this.entries.map((e) => e.vector);
    }

    const scores: Array<{ entry: IndexEntry; score: number }> = [];

    for (let i = 0; i < this.entries.length; i++) {
      if (i > 0 && i % YIELD_THRESHOLD === 0) {
        await yieldThread();
      }
      const entryVec = entryVecs[i];
      if (!entryVec || entryVec.length !== queryVec.length) continue;
      const score = cosineSimilarity(queryVec, entryVec);
      scores.push({ entry: this.entries[i], score });
    }

    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, k);

    return top.map(({ entry, score }) => ({
      filePath: entry.filePath,
      snippet: entry.snippet,
      score,
    }));
  }

  private rebuildVocab(texts: string[]): void {
    this.vocab.clear();
    let idx = 0;
    for (const text of texts) {
      for (const token of tokenize(text)) {
        if (!this.vocab.has(token)) {
          this.vocab.set(token, idx++);
        }
      }
    }
    this.vocabDirty = false;
  }

  getEntryCount(): number {
    return this.entries.length;
  }

  getIndexedFilePaths(): string[] {
    return Array.from(this.filePaths);
  }
}

export const aiMemoryIndex = new AIMemoryIndexService();

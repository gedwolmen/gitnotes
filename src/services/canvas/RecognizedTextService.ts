/**
 * RecognizedTextService — persists vision-model transcriptions as markdown
 * files in the user's git repo and indexes them for chat recall.
 *
 * Pattern reference: ThoughtDumpService.ts (repo write queue + file naming).
 *
 * File naming: `{canvasId}-recognition-{timestamp}-{shortId}.md`
 * File location: `canvases/{canvasId}/` (same folder as the canvas JSON)
 * File body: raw observedText from vision model, optionally with metadata
 *            header as HTML comment.
 *
 * Indexing: on save, calls recognitionIndexingService.upsert() so the text
 *           becomes searchable via "what did I write about X?" in AI chat.
 */

/**
 * File storage interface for recognized text records.
 * Implementations should provide file I/O operations for markdown files
 * stored in the git repo under canvases/{canvasId}/recognition-*.md
 */
export interface FileStorageService {
  saveFile(repoPath: string, branch: string, filePath: string, content: string): Promise<void>;
  readFile(repoPath: string, branch: string, filePath: string): Promise<string | null>;
  deleteFile(repoPath: string, branch: string, filePath: string): Promise<void>;
  listFiles(repoPath: string, branch: string, folderPath: string): Promise<{ path: string }[]>;
}export interface RecognitionRecord {
  id: string;
  canvasId: string;
  text: string;
  createdAt: string;
  filePath: string;
}

interface RecognitionIndexingService {
  upsert: (filePath: string, text: string) => Promise<void>;
  remove: (filePath: string) => Promise<void>;
}

export interface RecognizedTextServiceDeps {
  fileStorage: FileStorageService;
  indexingService: RecognitionIndexingService;
  repoPath: string;
  branch: string;
}

export class RecognizedTextService {
  private deps: RecognizedTextServiceDeps;

  constructor(deps: RecognizedTextServiceDeps) {
    this.deps = deps;
  }

  /**
   * Save a vision-model transcription to the repo and index it.
   *
   * Returns the created record with file path. The file is queued for
   * git sync via the same mechanism as thought dumps.
   */
  async saveRecognition(
    canvasId: string,
    observedText: string,
  ): Promise<RecognitionRecord> {
    if (!canvasId) throw new Error('canvasId required');
    if (!observedText?.trim()) throw new Error('observedText cannot be empty');

    const id = this.generateId();
    const timestamp = new Date().toISOString();
    const filePath = this.buildFilePath(canvasId, id);

    // Build file body with metadata header
    const fileBody = `<!-- gitnotes-recognition
id: ${id}
canvasId: ${canvasId}
createdAt: ${timestamp}
model: vision-transcription
-->

${observedText}
`;

    // Queue write via thought dump service (reuses repo sync queue)
    await this.deps.fileStorage.saveFile(this.deps.repoPath, this.deps.branch, filePath, fileBody);

    // Index for chat recall
    await this.deps.indexingService.upsert(filePath, observedText);

    return {
      id,
      canvasId,
      text: observedText,
      createdAt: timestamp,
      filePath,
    };
  }

  /**
   * Delete a recognition record: remove file + remove from index.
   */
  async deleteRecognition(id: string, canvasId: string): Promise<void> {
    const record = await this.getRecognition(id, canvasId);
    if (!record) return;

    await this.deps.fileStorage.deleteFile(this.deps.repoPath, this.deps.branch, record.filePath);
    await this.deps.indexingService.remove(record.filePath);
  }

  /**
   * List all recognitions for a canvas.
   *
   * Returns an empty array if no recognitions exist.
   */
  async listRecognitions(canvasId: string): Promise<RecognitionRecord[]> {
    const folderPath = `canvases/${canvasId}/`;
    const files = await this.deps.fileStorage.listFiles(this.deps.repoPath, this.deps.branch, folderPath);

    const recognitions: RecognitionRecord[] = [];
    for (const file of files) {
      if (!file.path.startsWith('recognition-')) continue;

      try {
        const content = await this.deps.fileStorage.readFile(this.deps.repoPath, this.deps.branch, file.path);
        if (!content) continue;

        // Parse metadata from HTML comment
        const metaMatch = content.match(/<!-- gitnotes-recognition\n([\s\S]*?)\n-->/);
        if (!metaMatch) continue;

        const meta = this.parseMetadata(metaMatch[1]);
        const text = content.slice(metaMatch[0].length).trim();

        recognitions.push({
          id: meta.id,
          canvasId: meta.canvasId,
          text,
          createdAt: meta.createdAt,
          filePath: file.path,
        });
      } catch (err) {
        console.warn('[RecognizedTextService] Failed to parse recognition:', file.path, err);
      }
    }

    return recognitions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Get a single recognition by ID.
   */
  async getRecognition(id: string, canvasId: string): Promise<RecognitionRecord | null> {
    const all = await this.listRecognitions(canvasId);
    return all.find(r => r.id === id) || null;
  }

  private buildFilePath(canvasId: string, id: string): string {
    const shortId = id.slice(0, 8);
    const timestamp = Date.now().toString(36);
    return `canvases/${canvasId}/recognition-${timestamp}-${shortId}.md`;
  }

  private generateId(): string {
    return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private parseMetadata(metaBlock: string): { id: string; canvasId: string; createdAt: string } {
    const lines = metaBlock.split('\n');
    const meta: Record<string, string> = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        meta[key] = value;
      }
    }
    return {
      id: meta.id,
      canvasId: meta.canvasId,
      createdAt: meta.createdAt,
    };
  }
}

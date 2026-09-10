import { File } from 'expo-file-system';

import { normalizeWorktreeRelPath } from '@/services/git/GitFsService';
import { DocumentService } from './DocumentService';
import { DocumentError } from '@/models/Document';
import type { Document, DocumentCreateInput, DocumentUpdateInput } from '@/models/Document';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class WriteError extends DocumentError {
  constructor(message: string, cause?: unknown) {
    super('IO_ERROR', message);
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

/**
 * DocumentService adapter that writes the editor's saved body straight into
 * a repository working-tree file (raw content, no frontmatter) instead of the
 * documents workspace. Shared by Explore's file editor (todo 23) and the
 * conflict resolver (todo 21 pattern).
 */
export class WorkingTreeDocumentService extends DocumentService {
  private current: Document;
  public writeError: WriteError | null = null;

  constructor(
    private readonly repoPath: string,
    private readonly relativePath: string,
    document: Document,
  ) {
    super();
    this.current = document;
  }

  private async write(body: string): Promise<void> {
    normalizeWorktreeRelPath(this.relativePath);
    if (body.length > MAX_FILE_SIZE) {
      throw new WriteError(
        `Content (${body.length} bytes) exceeds maximum file size of ${MAX_FILE_SIZE} bytes`,
      );
    }
    const file = new File(this.repoPath, this.relativePath);
    try {
      file.write(body);
    } catch (error) {
      throw new WriteError(`Failed to write ${this.relativePath}: ${errorMessage(error)}`, error);
    }
  }

  override async update(_id: string, input: DocumentUpdateInput): Promise<Document> {
    const body = input.body ?? '';
    await this.write(body);
    this.current = { ...this.current, body, raw: body, updatedAt: Date.now() };
    return this.current;
  }

  override async create(input: DocumentCreateInput): Promise<Document> {
    return this.update(this.current.id, input);
  }
}

/** Synthetic Document that lets the unified editor open an arbitrary
 * working-tree file without touching the documents index. */
export function workingTreeDocument(
  relativePath: string,
  body: string,
  tag: string,
): Document {
  const fileName = relativePath.split('/').pop() ?? relativePath;
  const now = Date.now();
  return {
    id: `working-tree:${relativePath}`,
    type: 'note',
    path: relativePath,
    title: fileName,
    slug: fileName,
    folder: null,
    tags: [tag],
    createdAt: now,
    updatedAt: now,
    isPinned: false,
    deleted: false,
    body,
    raw: body,
  };
}

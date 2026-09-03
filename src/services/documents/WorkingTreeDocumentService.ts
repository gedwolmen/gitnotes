import { File } from 'expo-file-system';

import { DocumentService } from './DocumentService';
import type { Document, DocumentCreateInput, DocumentUpdateInput } from '@/models/Document';

/**
 * DocumentService adapter that writes the editor's saved body straight into
 * a repository working-tree file (raw content, no frontmatter) instead of the
 * documents workspace. Shared by Explore's file editor (todo 23) and the
 * conflict resolver (todo 21 pattern).
 */
export class WorkingTreeDocumentService extends DocumentService {
  private current: Document;

  constructor(
    private readonly repoPath: string,
    private readonly relativePath: string,
    document: Document,
  ) {
    super();
    this.current = document;
  }

  override async update(_id: string, input: DocumentUpdateInput): Promise<Document> {
    const body = input.body ?? '';
    new File(this.repoPath, this.relativePath).write(body);
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

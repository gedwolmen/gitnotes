/**
 * Portable TermDraw-compatible diagram document model.
 * Schema compatibility: termdraw `.td.json` format, version 1.
 * Provenance: clean-room implementation compatible with the termdraw v1 schema.
 *
 * This module re-exports the public surface from sub-modules and defines
 * the Git-backed Diagram wrapper type.
 */

// Re-export foundational types
export {
  DIAGRAM_DOCUMENT_VERSION,
  type BoxStyle,
  type DrawDocument,
  type DrawObject,
  type ElbowObject,
  type ElbowOrientation,
  type InkColor,
  type LineObject,
  type LineStyle,
  type PaintObject,
  type Point,
  type Rect,
  type TextBorderMode,
  type TextObject,
  type BoxObject,
  assertNever,
  isValidRect,
} from './DiagramTypes';

// Re-export factory functions
export {
  createBox,
  createDiagramDocument,
  createElbow,
  createLine,
  createPaint,
  createText,
  generateObjectId,
} from './DiagramFactory';

import type { DrawDocument } from './DiagramTypes';

export const DEFAULT_DIAGRAM_DOCUMENT: DrawDocument = {
  version: 1,
  objects: [],
};

export interface Diagram {
  readonly id: string;
  readonly title: string;
  readonly document: DrawDocument;
  readonly folderPath?: string;
  readonly repo?: string;
  readonly branch?: string;
  readonly filePath?: string;
  readonly tags: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly accountId?: string;
  readonly lastPulledDocument?: string;
}

export interface DiagramCreateInput {
  readonly title: string;
  readonly document?: DrawDocument;
  readonly folderPath?: string;
  readonly repo?: string;
  readonly branch?: string;
  readonly filePath?: string;
  readonly tags?: readonly string[];
  readonly accountId?: string;
  readonly lastPulledDocument?: string;
}

export interface DiagramUpdateInput {
  readonly id: string;
  readonly title?: string;
  readonly document?: DrawDocument;
  readonly folderPath?: string;
  readonly repo?: string;
  readonly branch?: string;
  readonly filePath?: string;
  readonly tags?: readonly string[];
  readonly accountId?: string;
  readonly lastPulledDocument?: string;
}

function generateDiagramId(): string {
  return `diagram-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createDiagram(input: DiagramCreateInput): Diagram {
  const now = Date.now();
  return Object.freeze({
    id: generateDiagramId(),
    title: input.title,
    document: input.document ?? DEFAULT_DIAGRAM_DOCUMENT,
    folderPath: input.folderPath,
    repo: input.repo,
    branch: input.branch,
    filePath: input.filePath,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    accountId: input.accountId,
    lastPulledDocument: input.lastPulledDocument,
  });
}

export function updateDiagram(existing: Diagram, input: Partial<DiagramCreateInput>): Diagram {
  return Object.freeze({
    ...existing,
    title: input.title ?? existing.title,
    document: input.document ?? existing.document,
    folderPath: input.folderPath ?? existing.folderPath,
    repo: input.repo ?? existing.repo,
    branch: input.branch ?? existing.branch,
    filePath: input.filePath ?? existing.filePath,
    tags: input.tags ?? existing.tags,
    accountId: input.accountId ?? existing.accountId,
    lastPulledDocument: input.lastPulledDocument ?? existing.lastPulledDocument,
    updatedAt: Date.now(),
  });
}

export const DIAGRAM_LINK_PREFIX = 'diagram:';

export function isDiagramLink(target: string): boolean {
  return target.startsWith(DIAGRAM_LINK_PREFIX);
}

export function diagramIdFromLink(target: string): string {
  if (!isDiagramLink(target)) {
    throw new Error(`Not a diagram link: ${target}`);
  }
  return target.slice(DIAGRAM_LINK_PREFIX.length);
}

export function diagramToLink(diagram: Pick<Diagram, 'id'>): string {
  return `${DIAGRAM_LINK_PREFIX}${diagram.id}`;
}

export function sortDiagramsByUpdated(diagrams: Diagram[]): Diagram[] {
  return [...diagrams].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function filterDiagramsBySearch(diagrams: Diagram[], query: string): Diagram[] {
  if (!query.trim()) return diagrams;
  const q = query.toLowerCase();
  return diagrams.filter(
    (d) =>
      d.title.toLowerCase().includes(q) ||
      d.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export function slugifyDiagramTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled-diagram'
  );
}

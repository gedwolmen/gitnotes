export type AnimationType = 'pulse' | 'fade' | 'spin' | 'translate';

export interface CanvasAnimation {
  type: AnimationType;
  duration: number;
  loop: boolean;
}

export interface CanvasStroke {
  type: 'stroke';
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  width: number;
  points: { x: number; y: number }[];
  animation?: CanvasAnimation;
}

export interface CanvasShape {
  type: 'shape';
  id: string;
  shape: 'line' | 'rect' | 'ellipse' | 'diamond' | 'roundRect' | 'arrow';
  color: string;
  fillColor?: string;
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  animation?: CanvasAnimation;
}

export interface CanvasText {
  type: 'text';
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  animation?: CanvasAnimation;
}

export interface CanvasChart {
  type: 'chart';
  id: string;
  chartType: 'bar' | 'line' | 'pie';
  title: string;
  labels: string[];
  values: number[];
  x: number;
  y: number;
  width: number;
  height: number;
  animation?: CanvasAnimation;
}

export interface CanvasImage {
  type: 'image';
  id: string;
  data: string;
  mimeType: 'image/jpeg';
  x: number;
  y: number;
  width: number;
  height: number;
  animation?: CanvasAnimation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCanvasAnimation(value: unknown): value is CanvasAnimation {
  if (!isRecord(value)) return false;

  return (value.type === 'pulse'
      || value.type === 'fade'
      || value.type === 'spin'
      || value.type === 'translate')
    && isFiniteNumber(value.duration)
    && typeof value.loop === 'boolean';
}

export function isImageElement(el: unknown): el is CanvasImage {
  if (!isRecord(el)) return false;

  return el.type === 'image'
    && typeof el.id === 'string'
    && typeof el.data === 'string'
    && el.data.trim().length > 0
    && el.mimeType === 'image/jpeg'
    && isFiniteNumber(el.x)
    && isFiniteNumber(el.y)
    && isFiniteNumber(el.width)
    && el.width > 0
    && isFiniteNumber(el.height)
    && el.height > 0
    && (el.animation === undefined || isCanvasAnimation(el.animation));
}

export type CanvasElement = CanvasStroke | CanvasShape | CanvasText | CanvasChart | CanvasImage;

export interface CanvasScene {
  version: number;
  width: number;
  height: number;
  background: string;
  elements: CanvasElement[];
}

export interface Canvas {
  id: string;
  title: string;
  scene: CanvasScene;
  folderPath?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  accountId?: string;
  /** Stable serialization of `scene` as observed on the last pull, used to
   * detect unsaved local edits during reconcile. */
  lastPulledScene?: string;
}

export interface CanvasCreateInput {
  title: string;
  scene?: Partial<CanvasScene>;
  folderPath?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
  tags?: string[];
  accountId?: string;
  lastPulledScene?: string;
}

export interface CanvasUpdateInput {
  id: string;
  title?: string;
  scene?: CanvasScene;
  folderPath?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
  tags?: string[];
  accountId?: string;
  lastPulledScene?: string;
}

function generateId(): string {
  return `canvas-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const DEFAULT_SCENE: CanvasScene = {
  version: 1,
  width: 800,
  height: 600,
  background: '#FFFFFF',
  elements: [],
};

export function createCanvas(input: CanvasCreateInput): Canvas {
  const now = Date.now();
  return {
    id: generateId(),
    title: input.title,
    scene: {
      ...DEFAULT_SCENE,
      ...input.scene,
      elements: input.scene?.elements ?? [],
    },
    folderPath: input.folderPath,
    repo: input.repo,
    branch: input.branch,
    filePath: input.filePath,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    accountId: input.accountId,
    lastPulledScene: input.lastPulledScene,
  };
}

export function updateCanvas(existing: Canvas, input: Partial<CanvasCreateInput>): Canvas {
  return {
    ...existing,
    title: input.title ?? existing.title,
    scene: input.scene ? { ...existing.scene, ...input.scene } : existing.scene,
    folderPath: input.folderPath ?? existing.folderPath,
    repo: input.repo ?? existing.repo,
    branch: input.branch ?? existing.branch,
    filePath: input.filePath ?? existing.filePath,
    tags: input.tags ?? existing.tags,
    accountId: input.accountId ?? existing.accountId,
    lastPulledScene: input.lastPulledScene ?? existing.lastPulledScene,
    updatedAt: Date.now(),
  };
}

export const CANVAS_LINK_PREFIX = 'canvas:';

export function isCanvasLink(target: string): boolean {
  return target.startsWith(CANVAS_LINK_PREFIX);
}

export function canvasIdFromLink(target: string): string {
  return target.slice(CANVAS_LINK_PREFIX.length);
}

export function canvasToLink(canvas: Pick<Canvas, 'id'>): string {
  return `${CANVAS_LINK_PREFIX}${canvas.id}`;
}

export function sortCanvasesByUpdated(canvases: Canvas[]): Canvas[] {
  return [...canvases].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function slugifyCanvasTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled-canvas';
}

export function filterCanvasesBySearch(canvases: Canvas[], query: string): Canvas[] {
  if (!query.trim()) return canvases;
  const q = query.toLowerCase();
  return canvases.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

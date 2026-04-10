export interface CanvasStroke {
  type: 'stroke';
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  width: number;
  points: { x: number; y: number }[];
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
}

export interface CanvasText {
  type: 'text';
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
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
}

export type CanvasElement = CanvasStroke | CanvasShape | CanvasText | CanvasChart;

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
}

export interface CanvasCreateInput {
  title: string;
  scene?: Partial<CanvasScene>;
  folderPath?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
  tags?: string[];
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

export function canvasToLink(canvas: Canvas): string {
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

import type {
  BoxObject,
  BoxStyle,
  DrawDocument,
  ElbowOrientation,
  ElbowObject,
  InkColor,
  LineObject,
  LineStyle,
  PaintObject,
  Point,
  TextBorderMode,
  TextObject,
} from './DiagramTypes';
import { DIAGRAM_DOCUMENT_VERSION } from './DiagramTypes';

let _counter = 0;

export function generateObjectId(): string {
  _counter += 1;
  return `td-${Date.now().toString(36)}-${_counter.toString(36)}`;
}

export function createBox(
  opts: Readonly<{
    id?: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
    style?: BoxStyle;
    color?: InkColor;
    z?: number;
    parentId?: string | null;
  }>,
): BoxObject {
  return Object.freeze({
    id: opts.id ?? generateObjectId(),
    type: 'box',
    z: opts.z ?? 1,
    parentId: opts.parentId ?? null,
    color: opts.color ?? 'white',
    left: opts.left,
    top: opts.top,
    right: opts.right,
    bottom: opts.bottom,
    style: opts.style ?? 'auto',
  });
}

export function createLine(
  opts: Readonly<{
    id?: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    style?: LineStyle;
    color?: InkColor;
    z?: number;
    parentId?: string | null;
  }>,
): LineObject {
  return Object.freeze({
    id: opts.id ?? generateObjectId(),
    type: 'line',
    z: opts.z ?? 1,
    parentId: opts.parentId ?? null,
    color: opts.color ?? 'white',
    x1: opts.x1,
    y1: opts.y1,
    x2: opts.x2,
    y2: opts.y2,
    style: opts.style ?? 'smooth',
  });
}

export function createElbow(
  opts: Readonly<{
    id?: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    style?: LineStyle;
    orientation?: ElbowOrientation;
    color?: InkColor;
    z?: number;
    parentId?: string | null;
  }>,
): ElbowObject {
  return Object.freeze({
    id: opts.id ?? generateObjectId(),
    type: 'elbow',
    z: opts.z ?? 1,
    parentId: opts.parentId ?? null,
    color: opts.color ?? 'white',
    x1: opts.x1,
    y1: opts.y1,
    x2: opts.x2,
    y2: opts.y2,
    style: opts.style ?? 'light',
    orientation: opts.orientation ?? 'horizontal-first',
  });
}

export function createPaint(
  opts: Readonly<{
    id?: string;
    points: readonly Point[];
    brush?: string;
    color?: InkColor;
    z?: number;
    parentId?: string | null;
  }>,
): PaintObject {
  const frozenPoints = Object.freeze(
    opts.points.map((p) => Object.freeze({ x: p.x, y: p.y })),
  );
  return Object.freeze({
    id: opts.id ?? generateObjectId(),
    type: 'paint',
    z: opts.z ?? 1,
    parentId: opts.parentId ?? null,
    color: opts.color ?? 'white',
    points: frozenPoints,
    brush: opts.brush ?? '#',
  });
}

export function createText(
  opts: Readonly<{
    id?: string;
    x: number;
    y: number;
    content: string;
    border?: TextBorderMode;
    color?: InkColor;
    z?: number;
    parentId?: string | null;
  }>,
): TextObject {
  return Object.freeze({
    id: opts.id ?? generateObjectId(),
    type: 'text',
    z: opts.z ?? 1,
    parentId: opts.parentId ?? null,
    color: opts.color ?? 'white',
    x: opts.x,
    y: opts.y,
    content: opts.content,
    border: opts.border ?? 'none',
  });
}

export function createDiagramDocument(): DrawDocument {
  return Object.freeze({
    version: DIAGRAM_DOCUMENT_VERSION,
    objects: Object.freeze([]),
  });
}

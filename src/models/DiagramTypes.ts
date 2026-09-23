/**
 * Portable TermDraw-compatible diagram document model — foundational types.
 * Schema compatibility: termdraw `.td.json` format, version 1.
 * Provenance: clean-room implementation compatible with the termdraw v1 schema.
 */

export const DIAGRAM_DOCUMENT_VERSION = 1 as const;

export type BoxStyle = 'auto' | 'light' | 'heavy' | 'double' | 'dashed';
export type LineStyle = 'smooth' | 'light' | 'double' | 'dashed';
export type TextBorderMode = 'none' | 'single' | 'double' | 'underline';
export type ElbowOrientation = 'horizontal-first' | 'vertical-first';
export type InkColor =
  | 'white'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'magenta';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface BaseDrawObject {
  readonly id: string;
  readonly z: number;
  readonly parentId: string | null;
  readonly color: InkColor;
}

export interface BoxObject extends BaseDrawObject {
  readonly type: 'box';
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly style: BoxStyle;
}

export interface LineObject extends BaseDrawObject {
  readonly type: 'line';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly style: LineStyle;
}

export interface ElbowObject extends BaseDrawObject {
  readonly type: 'elbow';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly style: LineStyle;
  readonly orientation: ElbowOrientation;
}

export interface PaintObject extends BaseDrawObject {
  readonly type: 'paint';
  readonly points: readonly Point[];
  readonly brush: string;
}

export interface TextObject extends BaseDrawObject {
  readonly type: 'text';
  readonly x: number;
  readonly y: number;
  readonly content: string;
  readonly border: TextBorderMode;
}

export type DrawObject = BoxObject | LineObject | ElbowObject | PaintObject | TextObject;

export interface DrawDocument {
  readonly version: typeof DIAGRAM_DOCUMENT_VERSION;
  readonly objects: readonly DrawObject[];
}

export function isValidRect(r: Rect): boolean {
  return r.left <= r.right && r.top <= r.bottom;
}

export function assertNever(_value: never, message = 'Unexpected draw object variant'): never {
  throw new Error(message);
}

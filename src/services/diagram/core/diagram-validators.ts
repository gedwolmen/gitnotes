/**
 * Type guard helpers for diagram object validation.
 * Provenance: clean-room implementation; compatible with termdraw v1 schema.
 */

import type {
  BoxStyle,
  ElbowOrientation,
  InkColor,
  LineStyle,
  TextBorderMode,
} from '../../../models/Diagram';

// ---------------------------------------------------------------------------
// Enum value sets (mirrors Diagram.ts constants)
// ---------------------------------------------------------------------------

const INK_COLORS: readonly InkColor[] = [
  'white',
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'magenta',
];

const BOX_STYLES: readonly BoxStyle[] = ['auto', 'light', 'heavy', 'double', 'dashed'];

const LINE_STYLES: readonly LineStyle[] = ['smooth', 'light', 'double', 'dashed'];

const TEXT_BORDER_MODES: readonly TextBorderMode[] = ['none', 'single', 'double', 'underline'];

const ELBOW_ORIENTATIONS: readonly ElbowOrientation[] = ['horizontal-first', 'vertical-first'];

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Narrow to enum value if it exists in the allowed set. */
export function isInEnum<T extends string>(value: string, enumVals: readonly T[]): value is T {
  return (enumVals as readonly string[]).includes(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function isValidRect(left: number, right: number, top: number, bottom: number): boolean {
  return left <= right && top <= bottom;
}

export function isVisibleCell(brush: string): boolean {
  const trimmed = brush.trim();
  return trimmed.length > 0 && [...trimmed].length === 1;
}

// ---------------------------------------------------------------------------
// Re-exports for use in parser.ts
// ---------------------------------------------------------------------------

export { INK_COLORS, BOX_STYLES, LINE_STYLES, TEXT_BORDER_MODES, ELBOW_ORIENTATIONS };

/**
 * Shared helpers for diagram state operations.
 * Provenance: clean-room implementation; compatible with termdraw v1 schema.
 */

import { assertNever } from '../../../models/Diagram';
import type { DiagramSnapshot } from './state';
import type { DrawObject } from '../../../models/Diagram';
import { MAX_HISTORY } from './state';

// ---------------------------------------------------------------------------
// Push undo (bounded)
// ---------------------------------------------------------------------------

/** Push a snapshot onto the undo stack, bounded to MAX_HISTORY entries. */
export function pushUndo(
  snapshot: DiagramSnapshot,
  undoStack: readonly DiagramSnapshot[],
): readonly DiagramSnapshot[] {
  const next = [...undoStack, snapshot];
  return Object.freeze(next.slice(-MAX_HISTORY));
}

// ---------------------------------------------------------------------------
// Document snapshot update
// ---------------------------------------------------------------------------

/** Returns a new snapshot with the given objects array as its document. */
export function updateObjects(
  snapshot: DiagramSnapshot,
  objects: readonly DrawObject[],
): DiagramSnapshot {
  return Object.freeze({
    ...snapshot,
    document: Object.freeze({
      ...snapshot.document,
      objects: Object.freeze([...objects]),
    }),
  });
}

// ---------------------------------------------------------------------------
// Object translation
// ---------------------------------------------------------------------------

/** Translate a single DrawObject by (dx, dy). Returns a frozen new object. */
export function translateObject(obj: DrawObject, dx: number, dy: number): DrawObject {
  switch (obj.type) {
    case 'box':
      return Object.freeze({
        ...obj,
        left: obj.left + dx,
        right: obj.right + dx,
        top: obj.top + dy,
        bottom: obj.bottom + dy,
      });
    case 'line':
      return Object.freeze({
        ...obj,
        x1: obj.x1 + dx,
        y1: obj.y1 + dy,
        x2: obj.x2 + dx,
        y2: obj.y2 + dy,
      });
    case 'elbow':
      return Object.freeze({
        ...obj,
        x1: obj.x1 + dx,
        y1: obj.y1 + dy,
        x2: obj.x2 + dx,
        y2: obj.y2 + dy,
      });
    case 'paint':
      return Object.freeze({
        ...obj,
        points: Object.freeze(
          obj.points.map((p) => Object.freeze({ x: p.x + dx, y: p.y + dy })),
        ),
      });
    case 'text':
      return Object.freeze({ ...obj, x: obj.x + dx, y: obj.y + dy });
    default:
      return assertNever(obj);
  }
}

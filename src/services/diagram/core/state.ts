/**
 * Immutable diagram state — selection, transform, and undo/redo.
 *
 * Schema compatibility: termdraw `.td.json` format, version 1.
 * Provenance: clean-room implementation; compatible with termdraw v1 schema.
 *
 * All operations return new state snapshots; the input state is never mutated.
 * Undo/redo history is bounded to MAX_HISTORY entries to prevent unbounded growth.
 */

import type {
  DrawDocument,
  DrawObject,
} from '../../../models/Diagram';
import { pushUndo, translateObject, updateObjects } from './diagram-helpers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of undo/redo snapshots to retain. */
export const MAX_HISTORY = 100;

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

/**
 * Immutable snapshot of editor state that is sufficient to restore
 * the full interactive diagram session (document + cursor + tool settings).
 */
export interface DiagramSnapshot {
  readonly document: DrawDocument;
  /** Currently selected object IDs, ordered by selection time. */
  readonly selectedIds: readonly string[];
  /** Monotonically increasing z-index counter for the next created object. */
  readonly nextZIndex: number;
  /** Current text border mode for new text objects. */
  readonly textBorderMode: 'none' | 'single' | 'double' | 'underline';
}

/**
 * Full state container including undo/redo history.
 */
export interface DiagramState extends DiagramSnapshot {
  readonly undoStack: readonly DiagramSnapshot[];
  readonly redoStack: readonly DiagramSnapshot[];
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function emptyDocument(): DrawDocument {
  return Object.freeze({ version: 1, objects: Object.freeze([]) });
}

function initialSnapshot(): DiagramSnapshot {
  return Object.freeze({
    document: emptyDocument(),
    selectedIds: Object.freeze([]),
    nextZIndex: 1,
    textBorderMode: 'none',
  });
}

export function createDiagramState(): DiagramState {
  return Object.freeze({
    ...initialSnapshot(),
    undoStack: Object.freeze([]),
    redoStack: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// Selection operations (pure functions returning new state)
// ---------------------------------------------------------------------------

/** Returns the selected DrawObjects from the current document, in document order. */
export function getSelectedObjects(state: DiagramState): DrawObject[] {
  const idSet = new Set(state.selectedIds);
  return state.document.objects.filter((obj) => idSet.has(obj.id));
}

/** Returns a new state with a single object selected. Clears redo. */
export function selectObject(state: DiagramState, id: string): DiagramState {
  return Object.freeze({
    ...state,
    selectedIds: Object.freeze([id]),
    redoStack: Object.freeze([]),
  });
}

/** Returns a new state with the given IDs selected. Clears redo. */
export function selectObjects(state: DiagramState, ids: readonly string[]): DiagramState {
  return Object.freeze({
    ...state,
    selectedIds: Object.freeze([...ids]),
    redoStack: Object.freeze([]),
  });
}

/** Returns a new state with no objects selected. Clears redo. */
export function clearSelection(state: DiagramState): DiagramState {
  return Object.freeze({
    ...state,
    selectedIds: Object.freeze([]),
    redoStack: Object.freeze([]),
  });
}

/** Returns a new state with all objects selected. Clears redo. */
export function selectAll(state: DiagramState): DiagramState {
  return Object.freeze({
    ...state,
    selectedIds: Object.freeze(state.document.objects.map((o) => o.id)),
    redoStack: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// Transform operations
// ---------------------------------------------------------------------------

/**
 * Moves all selected objects by (dx, dy).
 * Pushes the current snapshot onto the undo stack.
 *
 * Returns a new state if anything was moved, otherwise returns the input state unchanged.
 */
export function moveSelectedBy(
  state: DiagramState,
  dx: number,
  dy: number,
  _canvasWidth?: number,
  _canvasHeight?: number,
): DiagramState {
  if (state.selectedIds.length === 0) return state;

  const selected = getSelectedObjects(state);
  const moved = selected.map((obj) => translateObject(obj, dx, dy));

  let anyMoved = false;
  for (let i = 0; i < moved.length; i++) {
    const obj = moved[i]!;
    const orig = selected[i]!;
    const objType = obj.type;
    if (objType === 'box' && orig.type === 'box') {
      anyMoved = obj.left !== orig.left || obj.top !== orig.top;
    } else if (objType === 'line' && orig.type === 'line') {
      anyMoved = obj.x1 !== orig.x1 || obj.y1 !== orig.y1;
    } else if (objType === 'elbow' && orig.type === 'elbow') {
      anyMoved = obj.x1 !== orig.x1 || obj.y1 !== orig.y1;
    } else if (objType === 'paint' && orig.type === 'paint') {
      anyMoved = obj.points[0]?.x !== orig.points[0]?.x || obj.points[0]?.y !== orig.points[0]?.y;
    } else if (objType === 'text' && orig.type === 'text') {
      anyMoved = obj.x !== orig.x || obj.y !== orig.y;
    }
    if (anyMoved) break;
  }

  if (!anyMoved) return state;

  const idSet = new Set(state.selectedIds);
  const newObjects = state.document.objects.map((obj) => {
    if (idSet.has(obj.id)) {
      return moved.find((m) => m.id === obj.id) ?? obj;
    }
    return obj;
  });

  const newSnapshot = updateObjects(state, newObjects);
  return Object.freeze({
    ...newSnapshot,
    undoStack: pushUndo(state, state.undoStack),
    redoStack: Object.freeze([]),
  });
}

/**
 * Deletes all selected objects.
 * Pushes the current snapshot onto the undo stack.
 */
export function deleteSelected(state: DiagramState): DiagramState {
  if (state.selectedIds.length === 0) return state;

  const idSet = new Set(state.selectedIds);
  const newObjects = state.document.objects.filter((obj) => !idSet.has(obj.id));

  const newSnapshot = Object.freeze({
    ...state,
    document: Object.freeze({
      ...state.document,
      objects: Object.freeze([...newObjects]),
    }),
    selectedIds: Object.freeze([]),
  });

  return Object.freeze({
    ...newSnapshot,
    undoStack: pushUndo(state, state.undoStack),
    redoStack: Object.freeze([]),
  });
}

/**
 * Applies a raw DrawDocument replacement.
 * Pushes the current snapshot onto the undo stack.
 */
export function replaceDocument(state: DiagramState, document: DrawDocument): DiagramState {
  const newSnapshot = updateObjects(state, document.objects);
  return Object.freeze({
    ...newSnapshot,
    undoStack: pushUndo(state, state.undoStack),
    redoStack: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

export function canUndo(state: DiagramState): boolean {
  return state.undoStack.length > 0;
}

export function canRedo(state: DiagramState): boolean {
  return state.redoStack.length > 0;
}

/** Restores the previous snapshot from the undo stack. */
export function undo(state: DiagramState): DiagramState {
  if (state.undoStack.length === 0) return state;
  const previous = state.undoStack[state.undoStack.length - 1]!;
  return Object.freeze({
    ...previous,
    undoStack: Object.freeze(state.undoStack.slice(0, -1)),
    redoStack: Object.freeze([state, ...state.redoStack]),
  });
}

/** Restores the next snapshot from the redo stack. */
export function redo(state: DiagramState): DiagramState {
  if (state.redoStack.length === 0) return state;
  const next = state.redoStack[0]!;
  return Object.freeze({
    ...next,
    undoStack: Object.freeze([...state.undoStack, state]),
    redoStack: Object.freeze(state.redoStack.slice(1)),
  });
}

// ---------------------------------------------------------------------------
// Object helpers
// ---------------------------------------------------------------------------

/** Returns the object with the given ID, or undefined. */
export function getObjectById(state: DiagramState, id: string): DrawObject | undefined {
  return state.document.objects.find((obj) => obj.id === id);
}

/** Returns true if the given ID is currently selected. */
export function isSelected(state: DiagramState, id: string): boolean {
  return state.selectedIds.includes(id);
}

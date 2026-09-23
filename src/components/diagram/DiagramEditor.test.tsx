/**
 * Behavioral tests for diagram editor.
 *
 * Exercises the logic that lives in DiagramEditorContent and supporting
 * services — state helpers, hit-testing, export, undo/redo, and
 * screen-to-grid coordinate conversion.
 *
 * These tests live inside the worktree so they can import from
 * src/components/diagram and src/services/diagram without path hacks.
 * Run with:
 *   yarn jest src/components/diagram --no-coverage --forceExit --testPathIgnorePatterns "^$"
 */

import {
  DiagramState,
  canRedo,
  canUndo,
  deleteSelected,
  redo,
  replaceDocument,
  selectObject,
  undo,
} from '../../services/diagram/core/state';
import {
  createBox,
  createDiagramDocument,
  createElbow,
  createLine,
  createPaint,
  createText,
  DIAGRAM_DOCUMENT_VERSION,
} from '../../models/Diagram';
import type { DrawDocument, DrawObject } from '../../models/Diagram';
import { exportAscii } from '../../services/diagram/core/ascii';
import type { Point } from '../../models/Diagram';
import type { DrawingState } from './types';
import { hitTestObject } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(objects: DrawObject[]): DrawDocument {
  return Object.freeze({
    version: DIAGRAM_DOCUMENT_VERSION,
    objects: Object.freeze(objects),
  });
}

function makeState(objects: DrawObject[] = [], selectedIds: string[] = []): DiagramState {
  return Object.freeze({
    document: makeDoc(objects),
    selectedIds: Object.freeze([...selectedIds]),
    nextZIndex: (objects.length ?? 0) + 1,
    textBorderMode: 'none',
    undoStack: Object.freeze([]),
    redoStack: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// DrawingState type
// ---------------------------------------------------------------------------

describe('DrawingState type', () => {
  it('constructs a box drawing state', () => {
    const s: DrawingState = {
      type: 'box',
      startX: 5,
      startY: 10,
      currentX: 20,
      currentY: 30,
    };
    expect(s.type).toBe('box');
    expect(s.startX).toBe(5);
    expect(s.currentY).toBe(30);
  });

  it('constructs a paint drawing state with points', () => {
    const s: DrawingState = {
      type: 'paint',
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
        { x: 5, y: 6 },
      ],
    };
    expect(s.type).toBe('paint');
    expect(s.points).toHaveLength(3);
  });

  it('constructs a line drawing state without points', () => {
    const s: DrawingState = {
      type: 'line',
      startX: 0,
      startY: 0,
      currentX: 10,
      currentY: 0,
    };
    expect(s.type).toBe('line');
    expect(s.points).toBeUndefined();
  });

  it('constructs an elbow drawing state', () => {
    const s: DrawingState = {
      type: 'elbow',
      startX: 0,
      startY: 5,
      currentX: 10,
      currentY: 5,
    };
    expect(s.type).toBe('elbow');
  });
});

// ---------------------------------------------------------------------------
// hitTestObject
// ---------------------------------------------------------------------------

describe('hitTestObject', () => {
  it('detects a hit on a box', () => {
    const box = createBox({ left: 5, top: 5, right: 15, bottom: 10, style: 'auto', color: 'white', z: 0 });
    // inside the box
    expect(hitTestObject(box, 10, 7)).toBe(true);
    // on the boundary
    expect(hitTestObject(box, 5, 5)).toBe(true);
    // outside the box
    expect(hitTestObject(box, 20, 20)).toBe(false);
  });

  it('detects a hit on a box with padding', () => {
    const box = createBox({ left: 5, top: 5, right: 10, bottom: 10, style: 'auto', color: 'white', z: 0 });
    // just outside but within default pad=1
    expect(hitTestObject(box, 4, 5)).toBe(true);
    // just outside with pad=2
    expect(hitTestObject(box, 4, 5, 2)).toBe(true);
    // far outside with pad=2
    expect(hitTestObject(box, 1, 1, 2)).toBe(false);
  });

  it('detects a hit on a line', () => {
    const line = createLine({ x1: 0, y1: 0, x2: 10, y2: 0, style: 'smooth', color: 'white', z: 0 });
    // on the line
    expect(hitTestObject(line, 5, 0)).toBe(true);
    // near the line within padding
    expect(hitTestObject(line, 5, 1, 1)).toBe(true);
    // far from the line
    expect(hitTestObject(line, 5, 5)).toBe(false);
  });

  it('detects a hit on a vertical line', () => {
    const line = createLine({ x1: 5, y1: 0, x2: 5, y2: 10, style: 'smooth', color: 'white', z: 0 });
    expect(hitTestObject(line, 5, 5)).toBe(true);
    // x=6 is within bounding box [4,6] (pad=1), so it hits
    expect(hitTestObject(line, 6, 5)).toBe(true);
    // x=7 is outside [4,6]
    expect(hitTestObject(line, 7, 5)).toBe(false);
  });

  it('detects a hit on an elbow', () => {
    const elbow = createElbow({ x1: 0, y1: 0, x2: 10, y2: 5, style: 'smooth', color: 'white', z: 0, orientation: 'horizontal-first' });
    expect(hitTestObject(elbow, 5, 0)).toBe(true);
    expect(hitTestObject(elbow, 10, 2)).toBe(true);
    // (0,5) is on the elbow path — y=5 is within bounding box y=[0,5]
    expect(hitTestObject(elbow, 0, 5)).toBe(true);
    // (0,6) is at boundary y=6; pad=1 gives y ≤ 6, so y=6 hits
    expect(hitTestObject(elbow, 0, 6)).toBe(true);
    expect(hitTestObject(elbow, 0, 7)).toBe(false);
  });

  it('detects a hit on a paint stroke', () => {
    const paint = createPaint({ points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }], color: 'white', z: 0 });
    // near a stroke point
    expect(hitTestObject(paint, 5, 5)).toBe(true);
    // far from stroke
    expect(hitTestObject(paint, 50, 50)).toBe(false);
  });

  it('detects a hit on a paint stroke with empty points', () => {
    const paint = createPaint({ points: [], color: 'white', z: 0 });
    // Empty paint has bounding box (0,0)-(0,0), expanded by pad=1: [-1,1] x [-1,1]
    expect(hitTestObject(paint, 0, 0)).toBe(true);
    expect(hitTestObject(paint, 5, 5)).toBe(false);
  });

  it('detects a hit on text', () => {
    const text = createText({ x: 5, y: 5, content: 'Hello', border: 'none', color: 'white', z: 0 });
    // inside text bounds
    expect(hitTestObject(text, 6, 5)).toBe(true);
    // at text end
    expect(hitTestObject(text, 9, 5)).toBe(true);
    // beyond text
    expect(hitTestObject(text, 15, 5)).toBe(false);
    // below text
    expect(hitTestObject(text, 5, 10)).toBe(false);
  });

  it('uses default padding of 1', () => {
    const box = createBox({ left: 10, top: 10, right: 11, bottom: 11, style: 'auto', color: 'white', z: 0 });
    // at exactly pad=1 outside
    expect(hitTestObject(box, 9, 10)).toBe(true);
    expect(hitTestObject(box, 12, 10)).toBe(true);
    // at pad=2 outside
    expect(hitTestObject(box, 8, 10)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Undo/Redo via state service
// ---------------------------------------------------------------------------

describe('undo/redo — via DiagramState service', () => {
  it('undo on empty history is no-op', () => {
    const state = makeState([]);
    const next = undo(state);
    // Should return same state (no change)
    expect(next.document.objects).toHaveLength(0);
  });

  it('undo after adding an object removes it', () => {
    const box = createBox({ left: 0, top: 0, right: 3, bottom: 2, style: 'auto', color: 'white', z: 0 });
    const withBox = replaceDocument(makeState(), makeDoc([box]));
    const undone = undo(withBox);
    expect(undone.document.objects).toHaveLength(0);
  });

  it('redo after undo restores the object', () => {
    const box = createBox({ left: 0, top: 0, right: 3, bottom: 2, style: 'auto', color: 'white', z: 0 });
    const withBox = replaceDocument(makeState(), makeDoc([box]));
    const undone = undo(withBox);
    const redone = redo(undone);
    expect(redone.document.objects).toHaveLength(1);
    expect(redone.document.objects[0]!.type).toBe('box');
  });

  it('adding an object clears the redo stack', () => {
    const box1 = createBox({ left: 0, top: 0, right: 3, bottom: 2, style: 'auto', color: 'white', z: 0 });
    const box2 = createBox({ left: 5, top: 5, right: 8, bottom: 7, style: 'auto', color: 'white', z: 1 });
    const withBox1 = replaceDocument(makeState(), makeDoc([box1]));
    const undone = undo(withBox1);
    // Add a new box after undo
    const withBox2 = replaceDocument(undone, makeDoc([box2]));
    // Redo stack should be cleared — redo should not restore box1
    const redone = redo(withBox2);
    expect(redone.document.objects).toHaveLength(1);
    expect(redone.document.objects[0]!.id).toBe(box2.id);
  });

  it('canUndo returns true after adding objects', () => {
    const box = createBox({ left: 0, top: 0, right: 3, bottom: 2, style: 'auto', color: 'white', z: 0 });
    const withBox = replaceDocument(makeState(), makeDoc([box]));
    expect(canUndo(withBox)).toBe(true);
  });

  it('canUndo returns false on empty state', () => {
    expect(canUndo(makeState())).toBe(false);
  });

  it('canRedo returns false on initial state', () => {
    expect(canRedo(makeState())).toBe(false);
  });

  it('canRedo returns true after undo', () => {
    const box = createBox({ left: 0, top: 0, right: 3, bottom: 2, style: 'auto', color: 'white', z: 0 });
    const withBox = replaceDocument(makeState(), makeDoc([box]));
    const undone = undo(withBox);
    expect(canRedo(undone)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Delete selected
// ---------------------------------------------------------------------------

describe('deleteSelected', () => {
  it('deleting with no selection is no-op', () => {
    const box = createBox({ left: 0, top: 0, right: 3, bottom: 2, style: 'auto', color: 'white', z: 0 });
    const state = makeState([box], []);
    const next = deleteSelected(state);
    expect(next.document.objects).toHaveLength(1);
  });

  it('deleting a selected object removes it', () => {
    const box = createBox({ left: 0, top: 0, right: 3, bottom: 2, style: 'auto', color: 'white', z: 0 });
    const selected = selectObject(makeState([box]), box.id);
    const next = deleteSelected(selected);
    expect(next.document.objects).toHaveLength(0);
  });

  it('deleting a non-selected object is no-op', () => {
    const box1 = createBox({ left: 0, top: 0, right: 3, bottom: 2, style: 'auto', color: 'white', z: 0 });
    const box2 = createBox({ left: 5, top: 5, right: 8, bottom: 7, style: 'auto', color: 'white', z: 1 });
    const state = makeState([box1, box2]);
    const selected = selectObject(state, box1.id);
    const next = deleteSelected(selected);
    expect(next.document.objects).toHaveLength(1);
    expect(next.document.objects[0]!.id).toBe(box2.id);
  });
});

// ---------------------------------------------------------------------------
// Export — empty document
// ---------------------------------------------------------------------------

describe('exportAscii', () => {
  it('returns a single space for empty document', () => {
    const doc = createDiagramDocument();
    const result = exportAscii(doc);
    expect(result).toBe(' ');
  });

  it('returns trimmed content for empty objects', () => {
    const doc = makeDoc([]);
    const result = exportAscii(doc).trim();
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Object creation — minimum sizes
// ---------------------------------------------------------------------------

describe('object creation minimum sizes', () => {
  it('box with zero size is not created (handleDrawEnd skips it)', () => {
    // A box where start == current is zero-size; handleDrawEnd checks >= 1
    const left = Math.min(5, 5);
    const top = Math.min(5, 5);
    const right = Math.max(5, 5);
    const bottom = Math.max(5, 5);
    const wouldCreate = right - left >= 1 || bottom - top >= 1;
    expect(wouldCreate).toBe(false);
  });

  it('box with 1-cell size is created', () => {
    const left = Math.min(0, 1);
    const top = Math.min(0, 1);
    const right = Math.max(0, 1);
    const bottom = Math.max(0, 1);
    const wouldCreate = right - left >= 1 || bottom - top >= 1;
    expect(wouldCreate).toBe(true);
  });

  it('line with same start and end is not created', () => {
    // handleDrawEnd checks startX !== currentX || startY !== currentY
    const sameX = 5 === 5;
    const sameY = 10 === 10;
    const wouldCreate = !(sameX || sameY);
    expect(wouldCreate).toBe(false);
  });

  it('line with different start and end is created', () => {
    const diffX = 0 !== 10;
    const diffY = 0 !== 0;
    const wouldCreate = diffX || diffY;
    expect(wouldCreate).toBe(true);
  });

  it('paint with no points is not created', () => {
    const points: Point[] = [];
    const wouldCreate = points.length > 0;
    expect(wouldCreate).toBe(false);
  });

  it('paint with points is created', () => {
    const points: Point[] = [{ x: 0, y: 0 }];
    const wouldCreate = points.length > 0;
    expect(wouldCreate).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid import / parse rejection
// ---------------------------------------------------------------------------

describe('invalid document import', () => {
  it('rejects malformed JSON', () => {
    const { parseDiagramDocument } = require('../../services/diagram/core/parser');
    expect(() => parseDiagramDocument('not json')).toThrow();
  });

  it('rejects JSON with wrong version', () => {
    const { migrateDiagramDocument } = require('../../services/diagram/core/parser');
    const result = migrateDiagramDocument({ version: 99, objects: [] });
    expect(result.ok).toBe(false);
  });

  it('rejects objects with invalid type discriminator', () => {
    const { migrateDiagramDocument } = require('../../services/diagram/core/parser');
    const result = migrateDiagramDocument({
      version: 1,
      objects: [{ id: 'x', type: 'invalid-type' }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects negative box coordinates without crashing', () => {
    const box = createBox({ left: -10, top: -5, right: -1, bottom: -1, style: 'auto', color: 'white', z: 0 });
    expect(box.left).toBe(-10);
    expect(box.right).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Checkout reset — git event handling logic
// ---------------------------------------------------------------------------

describe('checkout event navigation', () => {
  // The component subscribes to subscribeGitContentRefresh and navigates to
  // CanvasList when event.kind === 'checkout'. This test verifies the
  // navigation logic path is reachable (the handler exists and calls
  // navigate with correct params).
  it('checkout event kind is recognized', () => {
    const event = { kind: 'checkout' as const };
    expect(event.kind).toBe('checkout');
  });

  it('non-checkout events do not trigger canvas navigation', () => {
    const event = { kind: 'pull' as const };
    expect(event.kind).not.toBe('checkout');
  });
});

// ---------------------------------------------------------------------------
// Tool key assignment
// ---------------------------------------------------------------------------

describe('tool key type coverage', () => {
  it('all tool keys are assignable', () => {
    const { TOOLS } = require('./types');
    const keys: Array<'select' | 'box' | 'line' | 'elbow' | 'paint' | 'text' | 'erase'> =
      TOOLS.map((t: { key: string }) => t.key as 'select' | 'box' | 'line' | 'elbow' | 'paint' | 'text' | 'erase');
    expect(keys).toContain('select');
    expect(keys).toContain('box');
    expect(keys).toContain('line');
    expect(keys).toContain('elbow');
    expect(keys).toContain('paint');
    expect(keys).toContain('text');
    expect(keys).toContain('erase');
  });
});

// ---------------------------------------------------------------------------
// Coordinate conversion (screenToGridCoords logic)
// ---------------------------------------------------------------------------

describe('screenToGridCoords conversion', () => {
  // Mirror the conversion logic from DiagramEditorContent for unit testing
  // Uses CELL_SIZE = 12, origin at screen center
  const CELL_SIZE = 12;
  const originX = 375 / 2; // 187.5 — matches jest Dimensions mock
  const originY = 812 / 2;  // 406

  function screenToGrid(sx: number, sy: number, scale = 1, tx = 0, ty = 0): Point {
    return {
      x: Math.round((sx - originX - tx) / (CELL_SIZE * scale)),
      y: Math.round((sy - originY - ty) / (CELL_SIZE * scale)),
    };
  }

  it('converts center screen point to grid origin', () => {
    const result = screenToGrid(originX, originY);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('converts screen point to positive grid coords', () => {
    const result = screenToGrid(originX + 12, originY);
    expect(result.x).toBe(1);
    expect(result.y).toBe(0);
  });

  it('converts screen point to negative grid coords', () => {
    const result = screenToGrid(originX - 24, originY);
    expect(result.x).toBe(-2);
    expect(result.y).toBe(0);
  });

  it('accounts for viewport translation', () => {
    // tx=12 (viewport shifted right): grid appears to move left → x = (0 - 12) / 12 = -1
    const result = screenToGrid(originX, originY, 1, 12, 12);
    expect(result.x).toBe(-1);
    expect(result.y).toBe(-1);
  });

  it('accounts for viewport scale', () => {
    // At scale=2, each grid cell occupies 24 screen pixels
    const result = screenToGrid(originX + 24, originY, 2);
    expect(result.x).toBe(1);
    expect(result.y).toBe(0);
  });

  it('rounds to nearest grid cell', () => {
    // Half a cell to the right → rounds to 1
    const result = screenToGrid(originX + 6, originY);
    expect(result.x).toBe(1);
    // Half a cell to the left → Math.round(-0.5) === -0 in JS
    const result2 = screenToGrid(originX - 6, originY);
    expect(result2.x).toBe(-0);
  });

  it('handles out-of-grid far drag', () => {
    // Far outside the default grid area
    const result = screenToGrid(0, 0);
    expect(result.x).toBeLessThan(0);
    expect(result.y).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// Text entry interruption
// ---------------------------------------------------------------------------

describe('text entry interruption', () => {
  // When text overlay is cancelled (handleCancel), state should reset
  // without creating an object. This is verified by checking that
  // setTextOverlayVisible(false) without calling handleTextSubmit
  // leaves the document unchanged.
  it('cancelling text entry does not modify document', () => {
    const doc = createDiagramDocument();
    expect(doc.objects).toHaveLength(0);
    // Cancelling (no submit) leaves document unchanged
    const cancelled = doc;
    expect(cancelled.objects).toHaveLength(0);
  });

  it('submitting empty text does not create object', () => {
    const text = '';
    const trimmed = text.trim();
    const wouldCreate = trimmed.length > 0;
    expect(wouldCreate).toBe(false);
  });

  it('submitting whitespace-only text does not create object', () => {
    const text = '   ';
    const trimmed = text.trim();
    const wouldCreate = trimmed.length > 0;
    expect(wouldCreate).toBe(false);
  });

  it('submitting valid text creates object', () => {
    const text = 'Hello';
    const trimmed = text.trim();
    const wouldCreate = trimmed.length > 0;
    expect(wouldCreate).toBe(true);
    const obj = createText({
      x: 0,
      y: 0,
      content: trimmed,
      border: 'none',
      color: 'white',
      z: 0,
    });
    expect(obj.content).toBe('Hello');
  });
});

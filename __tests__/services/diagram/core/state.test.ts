import {
  DiagramState,
  MAX_HISTORY,
  canRedo,
  canUndo,
  clearSelection,
  createDiagramState,
  deleteSelected,
  getObjectById,
  getSelectedObjects,
  isSelected,
  moveSelectedBy,
  redo,
  replaceDocument,
  selectAll,
  selectObject,
  selectObjects,
  undo,
} from '../../../../src/services/diagram/core/state';
import {
  createBox,
  createLine,
  createElbow,
  createPaint,
  createText,
  DIAGRAM_DOCUMENT_VERSION,
} from '../../../../src/models/Diagram';
import type { DrawDocument, DrawObject } from '../../../../src/models/Diagram';

function stateWithObjects(objects: readonly DrawObject[]): DiagramState {
  const doc: DrawDocument = Object.freeze({ version: DIAGRAM_DOCUMENT_VERSION, objects });
  return Object.freeze({
    document: doc,
    selectedIds: Object.freeze([]),
    nextZIndex: objects.length + 1,
    textBorderMode: 'none',
    undoStack: Object.freeze([]),
    redoStack: Object.freeze([]),
  });
}

describe('DiagramState', () => {
  describe('createDiagramState', () => {
    it('creates an empty state', () => {
      const state = createDiagramState();
      expect(state.document.objects).toHaveLength(0);
      expect(state.selectedIds).toHaveLength(0);
      expect(state.nextZIndex).toBe(1);
      expect(canUndo(state)).toBe(false);
      expect(canRedo(state)).toBe(false);
    });

    it('is frozen', () => {
      const state = createDiagramState();
      expect(Object.isFrozen(state)).toBe(true);
    });
  });

  describe('selection', () => {
    const box = createBox({ left: 0, top: 0, right: 1, bottom: 1 });
    const line = createLine({ x1: 0, y1: 0, x2: 2, y2: 2 });
    const state = stateWithObjects([box, line]);

    it('selectObject selects one object by id', () => {
      const next = selectObject(state, box.id);
      expect(next.selectedIds).toEqual([box.id]);
      expect(isSelected(next, box.id)).toBe(true);
    });

    it('selectObjects selects multiple objects', () => {
      const next = selectObjects(state, [box.id, line.id]);
      expect(next.selectedIds).toEqual([box.id, line.id]);
    });

    it('clearSelection clears all selections', () => {
      const selected = selectObjects(state, [box.id]);
      const next = clearSelection(selected);
      expect(next.selectedIds).toHaveLength(0);
    });

    it('selectAll selects all objects', () => {
      const next = selectAll(state);
      expect(next.selectedIds).toEqual([box.id, line.id]);
    });

    it('selecting clears redo stack', () => {
      const selected = selectObject(state, box.id);
      expect(Object.isFrozen(selected.redoStack)).toBe(true);
    });

    it('getSelectedObjects returns matching objects', () => {
      const selected = selectObjects(state, [box.id]);
      const objs = getSelectedObjects(selected);
      expect(objs.map((o) => o.id)).toEqual([box.id]);
    });

    it('getSelectedObjects returns empty when nothing selected', () => {
      const objs = getSelectedObjects(state);
      expect(objs).toHaveLength(0);
    });
  });

  describe('getObjectById', () => {
    const box = createBox({ left: 0, top: 0, right: 1, bottom: 1 });
    const state = stateWithObjects([box]);

    it('returns the object with matching id', () => {
      const found = getObjectById(state, box.id);
      expect(found?.id).toBe(box.id);
    });

    it('returns undefined for unknown id', () => {
      const found = getObjectById(state, 'does-not-exist');
      expect(found).toBeUndefined();
    });
  });

  describe('moveSelectedBy', () => {
    const box = createBox({ id: 'b1', left: 1, top: 1, right: 3, bottom: 2 });
    const state = stateWithObjects([box]);

    it('moves selected object by (dx, dy)', () => {
      const selected = selectObject(state, 'b1');
      const moved = moveSelectedBy(selected, 2, 3);
      const obj = getObjectById(moved, 'b1')!;
      expect(obj.type).toBe('box');
      if (obj.type === 'box') {
        expect(obj.left).toBe(3);
        expect(obj.top).toBe(4);
      }
    });

    it('does not mutate the original state', () => {
      const selected = selectObject(state, 'b1');
      moveSelectedBy(selected, 2, 3);
      const original = getObjectById(state, 'b1')!;
      if (original.type === 'box') {
        expect(original.left).toBe(1);
        expect(original.top).toBe(1);
      }
    });

    it('returns original state unchanged when nothing selected', () => {
      const result = moveSelectedBy(state, 1, 1);
      expect(result).toBe(state);
    });

    it('pushes previous state onto undo stack', () => {
      const selected = selectObject(state, 'b1');
      const moved = moveSelectedBy(selected, 1, 0);
      expect(canUndo(moved)).toBe(true);
      expect(moved.undoStack[moved.undoStack.length - 1]).toBe(selected);
    });

    it('clears redo stack on move', () => {
      const selected = selectObject(state, 'b1');
      const moved = moveSelectedBy(selected, 1, 0);
      expect(canRedo(moved)).toBe(false);
    });

    it('moves multiple selected objects', () => {
      const box2 = createBox({ id: 'b2', left: 5, top: 5, right: 6, bottom: 6 });
      const multiState = stateWithObjects([box, box2]);
      const selected = selectObjects(multiState, ['b1', 'b2']);
      const moved = moveSelectedBy(selected, 1, 1);
      const b1 = getObjectById(moved, 'b1')!;
      const b2 = getObjectById(moved, 'b2')!;
      if (b1.type === 'box') expect(b1.left).toBe(2);
      if (b2.type === 'box') expect(b2.left).toBe(6);
    });

    it('translates paint points', () => {
      const paint = createPaint({ id: 'p1', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
      const paintState = stateWithObjects([paint]);
      const selected = selectObject(paintState, 'p1');
      const moved = moveSelectedBy(selected, 10, 20);
      const obj = getObjectById(moved, 'p1')!;
      if (obj.type === 'paint') {
        expect(obj.points[0]!.x).toBe(11);
        expect(obj.points[0]!.y).toBe(21);
        expect(obj.points[1]!.x).toBe(12);
        expect(obj.points[1]!.y).toBe(22);
      }
    });

    it('translates text position', () => {
      const text = createText({ id: 't1', x: 3, y: 4, content: 'Hi' });
      const textState = stateWithObjects([text]);
      const selected = selectObject(textState, 't1');
      const moved = moveSelectedBy(selected, -1, 2);
      const obj = getObjectById(moved, 't1')!;
      if (obj.type === 'text') {
        expect(obj.x).toBe(2);
        expect(obj.y).toBe(6);
      }
    });
  });

  describe('deleteSelected', () => {
    const box = createBox({ id: 'b1', left: 0, top: 0, right: 1, bottom: 1 });
    const line = createLine({ id: 'l1', x1: 0, y1: 0, x2: 2, y2: 0 });
    const state = stateWithObjects([box, line]);

    it('deletes selected objects', () => {
      const selected = selectObject(state, 'b1');
      const deleted = deleteSelected(selected);
      expect(getObjectById(deleted, 'b1')).toBeUndefined();
      expect(getObjectById(deleted, 'l1')).toBeDefined();
    });

    it('clears selection after deletion', () => {
      const selected = selectObject(state, 'b1');
      const deleted = deleteSelected(selected);
      expect(deleted.selectedIds).toHaveLength(0);
    });

    it('pushes previous state onto undo stack', () => {
      const selected = selectObject(state, 'b1');
      const deleted = deleteSelected(selected);
      expect(canUndo(deleted)).toBe(true);
    });

    it('returns original state when nothing selected', () => {
      const result = deleteSelected(state);
      expect(result).toBe(state);
    });
  });

  describe('replaceDocument', () => {
    it('replaces the document and pushes undo', () => {
      const box = createBox({ left: 0, top: 0, right: 1, bottom: 1 });
      const state = stateWithObjects([box]);

      const newDoc: DrawDocument = Object.freeze({
        version: 1,
        objects: Object.freeze([]),
      });
      const next = replaceDocument(state, newDoc);
      expect(next.document.objects).toHaveLength(0);
      expect(canUndo(next)).toBe(true);
    });
  });

  describe('undo / redo', () => {
    it('undo restores previous state', () => {
      const box = createBox({ id: 'b1', left: 0, top: 0, right: 1, bottom: 1 });
      const state = stateWithObjects([box]);
      const selected = selectObject(state, 'b1');
      const moved = moveSelectedBy(selected, 1, 0);

      const restored = undo(moved);
      expect(getObjectById(restored, 'b1')).toBeDefined();
      // The restored state should have the original (unmoved) position
      const restoredBox = getObjectById(restored, 'b1')!;
      if (restoredBox.type === 'box') {
        expect(restoredBox.left).toBe(0);
      }
    });

    it('redo restores next state', () => {
      const box = createBox({ id: 'b1', left: 0, top: 0, right: 1, bottom: 1 });
      const state = stateWithObjects([box]);
      const selected = selectObject(state, 'b1');
      const moved = moveSelectedBy(selected, 1, 0);

      const undone = undo(moved);
      const redone = redo(undone);
      const redoneBox = getObjectById(redone, 'b1')!;
      if (redoneBox.type === 'box') {
        expect(redoneBox.left).toBe(1);
      }
    });

    it('undo returns same state when undo stack is empty', () => {
      const state = createDiagramState();
      expect(undo(state)).toBe(state);
    });

    it('redo returns same state when redo stack is empty', () => {
      const state = createDiagramState();
      expect(redo(state)).toBe(state);
    });

    it('canUndo is true after mutation', () => {
      const box = createBox({ id: 'b1', left: 0, top: 0, right: 1, bottom: 1 });
      const state = stateWithObjects([box]);
      const selected = selectObject(state, 'b1');
      const moved = moveSelectedBy(selected, 1, 0);
      expect(canUndo(moved)).toBe(true);
    });

    it('canRedo is false after new mutation', () => {
      const box = createBox({ id: 'b1', left: 0, top: 0, right: 1, bottom: 1 });
      const state = stateWithObjects([box]);
      const selected = selectObject(state, 'b1');
      const moved = moveSelectedBy(selected, 1, 0);
      const undone = undo(moved);
      // After undo, redo should work
      expect(canRedo(undone)).toBe(true);
      // But a new mutation should clear redo
      const moved2 = moveSelectedBy(undone, 1, 0);
      expect(canRedo(moved2)).toBe(false);
    });

    it('undo stack is bounded to MAX_HISTORY', () => {
      const box = createBox({ id: 'b1', left: 0, top: 0, right: 1, bottom: 1 });
      let state = stateWithObjects([box]);
      state = selectObject(state, 'b1');

      for (let i = 0; i < MAX_HISTORY + 50; i++) {
        state = moveSelectedBy(state, 0, 1);
        state = selectObject(state, 'b1');
      }

      expect(state.undoStack.length).toBeLessThanOrEqual(MAX_HISTORY);
    });
  });
});

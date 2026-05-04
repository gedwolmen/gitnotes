import { act, renderHook } from '@testing-library/react-native';
import { useUndoRedo } from '../src/hooks/useUndoRedo';

describe('useUndoRedo', () => {
  test('starts with the initial text and empty history', () => {
    const { result } = renderHook(() => useUndoRedo('draft'));

    expect(result.current.text).toBe('draft');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  test('pushes a text change and enables undo', () => {
    const { result } = renderHook(() => useUndoRedo('draft'));

    act(() => {
      result.current.setText('final');
    });

    expect(result.current.text).toBe('final');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  test('undo walks back through multiple snapshots', () => {
    const { result } = renderHook(() => useUndoRedo('one'));

    act(() => {
      result.current.setText('two');
      result.current.setText('three');
      result.current.setText('four');
    });

    act(() => result.current.undo());
    expect(result.current.text).toBe('three');

    act(() => result.current.undo());
    expect(result.current.text).toBe('two');

    act(() => result.current.undo());
    expect(result.current.text).toBe('one');
    expect(result.current.canUndo).toBe(false);
  });

  test('undo then a new change clears the redo stack', () => {
    const { result } = renderHook(() => useUndoRedo('start'));

    act(() => {
      result.current.setText('middle');
      result.current.setText('end');
    });

    act(() => result.current.undo());
    expect(result.current.text).toBe('middle');
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.setText('replacement');
    });

    expect(result.current.text).toBe('replacement');
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.redo());
    expect(result.current.text).toBe('replacement');
  });

  test('redo advances after an undo', () => {
    const { result } = renderHook(() => useUndoRedo('a'));

    act(() => {
      result.current.setText('b');
      result.current.setText('c');
    });

    act(() => result.current.undo());
    expect(result.current.text).toBe('b');
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.text).toBe('c');
    expect(result.current.canRedo).toBe(false);
  });

  test('caps history at 100 snapshots', () => {
    const { result } = renderHook(() => useUndoRedo('0'));

    act(() => {
      for (let i = 1; i <= 101; i += 1) {
        result.current.setText(String(i));
      }
    });

    act(() => {
      for (let i = 0; i < 100; i += 1) {
        result.current.undo();
      }
    });

    expect(result.current.text).toBe('1');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });
});

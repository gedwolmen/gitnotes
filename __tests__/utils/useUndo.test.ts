import { renderHook, act } from '@testing-library/react-native';
import { useUndo } from '../../src/utils/useUndo';

describe('useUndo', () => {
  it('does NOT drop the first setState call after undo (B4 bug-hunt 2026-08)', () => {
    const { result } = renderHook(() => useUndo('initial'));

    act(() => {
      result.current.setState('A');
    });
    act(() => {
      result.current.setState('B');
    });
    expect(result.current.state).toBe('B');

    act(() => {
      result.current.undo();
    });
    expect(result.current.state).toBe('A');

    act(() => {
      result.current.setState('C');
    });
    expect(result.current.state).toBe('C');
  });

  it('does NOT drop the first setState call after redo', () => {
    const { result } = renderHook(() => useUndo('initial'));

    act(() => {
      result.current.setState('A');
    });
    act(() => {
      result.current.setState('B');
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.state).toBe('A');

    act(() => {
      result.current.redo();
    });
    expect(result.current.state).toBe('B');

    act(() => {
      result.current.setState('C');
    });
    expect(result.current.state).toBe('C');
  });

  it('does NOT drop the first setState call after reset', () => {
    const { result } = renderHook(() => useUndo('initial'));

    act(() => {
      result.current.setState('A');
    });
    act(() => {
      result.current.reset('reset-value');
    });
    expect(result.current.state).toBe('reset-value');

    act(() => {
      result.current.setState('after-reset');
    });
    expect(result.current.state).toBe('after-reset');
  });
});

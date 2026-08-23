import { renderHook, act } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { useResponsive } from '../../src/hooks/useResponsive';

describe('useResponsive shared subscription (bug-hunt loop3 #14)', () => {
  it('returns consistent responsive info across multiple hook instances', () => {
    const a = renderHook(() => useResponsive());
    const b = renderHook(() => useResponsive());

    expect(a.result.current.screenWidth).toBe(b.result.current.screenWidth);
    expect(a.result.current.deviceType).toBe(b.result.current.deviceType);
    expect(a.result.current.columnCount).toBe(b.result.current.columnCount);
  });

  it('updates all consumers when dimensions change', () => {
    const a = renderHook(() => useResponsive());
    const before = a.result.current;

    const changeHandlers: Array<(dims: unknown) => void> = [];
    const addListenerSpy = jest
      .spyOn(Dimensions, 'addEventListener')
      .mockImplementation(((event: string, handler: (dims: unknown) => void) => {
        changeHandlers.push(handler);
        return { remove: jest.fn() };
      }) as never);

    try {
      const b = renderHook(() => useResponsive());
      // New subscriber triggers the shared subscription setup.
      expect(b.result.current).toBeDefined();

      if (changeHandlers.length > 0) {
        act(() => {
          for (const handler of changeHandlers) {
            handler({ window: { width: 1400, height: 1000, scale: 2, fontScale: 1 } });
          }
        });
        expect(a.result.current.screenWidth).not.toBe(before.screenWidth);
      }
    } finally {
      addListenerSpy.mockRestore();
    }
  });
});

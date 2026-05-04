jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyHardWrap, useHardWrap } from '../src/hooks/useHardWrap';

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('applyHardWrap', () => {
  test('converts single newlines to hard breaks when enabled', () => {
    expect(applyHardWrap('Line one\nLine two', true)).toBe('Line one\n\nLine two');
  });

  test('leaves text unchanged when disabled', () => {
    expect(applyHardWrap('Line one\nLine two', false)).toBe('Line one\nLine two');
  });
});

describe('useHardWrap', () => {
  let resolveGetItem: ((value: string | null) => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveGetItem = undefined;
    storage.getItem.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGetItem = resolve;
        }) as any,
    );
    storage.setItem.mockResolvedValue(undefined as any);
  });

  test('starts disabled by default', () => {
    const { result } = renderHook(() => useHardWrap());

    expect(result.current.hardWrapEnabled).toBe(false);
  });

  test('toggles on and off', () => {
    const { result } = renderHook(() => useHardWrap());

    act(() => {
      result.current.toggleHardWrap();
    });
    expect(result.current.hardWrapEnabled).toBe(true);

    act(() => {
      result.current.toggleHardWrap();
    });
    expect(result.current.hardWrapEnabled).toBe(false);
  });

  test('hydrates and persists to AsyncStorage', async () => {
    const { result } = renderHook(() => useHardWrap());

    await act(async () => {
      resolveGetItem?.('true');
    });

    await waitFor(() => expect(result.current.hardWrapEnabled).toBe(true));

    act(() => {
      result.current.toggleHardWrap();
    });

    await waitFor(() => {
      expect(storage.setItem).toHaveBeenCalledWith('hardWrapEnabled', 'false');
    });
  });
});

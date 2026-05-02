jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn();
  const fetch = jest.fn();

  return {
    __esModule: true,
    default: {
      addEventListener,
      fetch,
    },
  };
});

import { act, renderHook, waitFor } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import { useNetworkStatus } from '../src/hooks/useNetworkStatus';

const netInfo = NetInfo as jest.Mocked<typeof NetInfo>;

describe('useNetworkStatus', () => {
  let unsubscribe: jest.Mock;
  let emitState: ((state: any) => void) | undefined;
  let resolveFetch: ((state: any) => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    unsubscribe = jest.fn();
    emitState = undefined;
    resolveFetch = undefined;

    netInfo.addEventListener.mockImplementation(((listener: any) => {
      emitState = listener;
      return unsubscribe;
    }) as any);
    netInfo.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve as any;
        }) as any,
    );
  });

  test('starts optimistic and unsubscribes on unmount', () => {
    const { result, unmount } = renderHook(() => useNetworkStatus());

    expect(result.current).toEqual({ isConnected: true, isInternetReachable: true });
    expect(netInfo.addEventListener).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('updates when netinfo emits online and offline states', () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      emitState?.({ isConnected: false, isInternetReachable: false });
    });
    expect(result.current).toEqual({ isConnected: false, isInternetReachable: false });

    act(() => {
      emitState?.({ isConnected: true, isInternetReachable: true });
    });
    expect(result.current).toEqual({ isConnected: true, isInternetReachable: true });
  });

  test('uses the first fetched status once available', async () => {
    const { result } = renderHook(() => useNetworkStatus());

    expect(result.current).toEqual({ isConnected: true, isInternetReachable: true });

    act(() => {
      resolveFetch?.({ isConnected: false, isInternetReachable: false });
    });

    await waitFor(() => {
      expect(result.current).toEqual({ isConnected: false, isInternetReachable: false });
    });
  });
});

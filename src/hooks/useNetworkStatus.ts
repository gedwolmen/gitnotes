import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean;
}

function toNetworkStatus(state: NetInfoState): NetworkStatus {
  const isConnected = state.isConnected ?? false;
  return {
    isConnected,
    isInternetReachable: state.isInternetReachable ?? isConnected,
  };
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
  });

  useEffect(() => {
    let active = true;

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (active) {
        setStatus(toNetworkStatus(state));
      }
    });

    NetInfo.fetch().then((state) => {
      if (active) {
        setStatus(toNetworkStatus(state));
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return status;
}

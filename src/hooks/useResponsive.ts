import { useSyncExternalStore } from 'react';
import { Dimensions } from 'react-native';

export type DeviceType = 'phone' | 'tablet' | 'desktop' | 'mac';

export interface ResponsiveInfo {
  isTablet: boolean;
  isLandscape: boolean;
  screenWidth: number;
  screenHeight: number;
  columns: number;
  maxContentWidth: number;
  sideBySide: boolean;
  deviceType: DeviceType;
  columnCount: number;
}

const TABLET_MIN_WIDTH = 600;
const TABLET_MIN_HEIGHT = 600;
const SIDE_BY_SIDE_MIN_WIDTH = 900;

const COLUMN_PRESETS = {
  list: {
    phone: 1,
    tablet: 2,
    desktop: 3,
    mac: 4,
  },
  bento: {
    phone: 2,
    tablet: 3,
    desktop: 4,
    mac: 4,
  },
} as const;

function getDeviceType(minDim: number, maxDim: number): DeviceType {
  if (minDim >= 1200) return 'mac';
  if (minDim >= 768) return 'desktop';
  if (minDim >= 600 && maxDim >= 600) return 'tablet';
  return 'phone';
}

function calculateResponsive(): ResponsiveInfo {
  const { width, height } = Dimensions.get('window');
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);

  const isTablet =
    (minDim >= TABLET_MIN_WIDTH && maxDim >= TABLET_MIN_HEIGHT);

  const isLandscape = width > height;

  const deviceType = getDeviceType(minDim, maxDim);

  const columns = (() => {
    if (width >= 1200) return 4;
    if (width >= 900) return 3;
    if (isTablet) return 2;
    return 1;
  })();

  const sideBySide = width >= SIDE_BY_SIDE_MIN_WIDTH;

  const maxContentWidth = (() => {
    if (width >= 1200) return 960;
    if (width >= 900) return 800;
    if (isTablet) return 640;
    return width;
  })();

  const columnCount = COLUMN_PRESETS.list[deviceType];

  return {
    isTablet,
    isLandscape,
    screenWidth: width,
    screenHeight: height,
    columns,
    maxContentWidth,
    sideBySide,
    deviceType,
    columnCount,
  };
}

let sharedInfo: ResponsiveInfo = calculateResponsive();
let sharedListenerCount = 0;
const sharedListeners = new Set<(info: ResponsiveInfo) => void>();

function ensureSharedSubscription(): void {
  if (sharedListenerCount > 0) return;
  Dimensions.addEventListener('change', () => {
    sharedInfo = calculateResponsive();
    for (const listener of sharedListeners) listener(sharedInfo);
  });
}

export function useResponsive(layoutType: 'list' | 'bento' = 'list'): ResponsiveInfo {
  const info = useSyncExternalStore(
    (onStoreChange) => {
      sharedListeners.add(onStoreChange);
      ensureSharedSubscription();
      sharedListenerCount += 1;
      return () => {
        sharedListeners.delete(onStoreChange);
        sharedListenerCount -= 1;
      };
    },
    () => sharedInfo,
    () => sharedInfo,
  );

  if (layoutType === 'bento') {
    return {
      ...info,
      columnCount: COLUMN_PRESETS.bento[info.deviceType],
    };
  }

  return info;
}

import { useState, useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';

export interface ResponsiveInfo {
  isTablet: boolean;
  isLandscape: boolean;
  screenWidth: number;
  screenHeight: number;
  columns: number;
  maxContentWidth: number;
  sideBySide: boolean;
}

const TABLET_MIN_WIDTH = 600;
const TABLET_MIN_HEIGHT = 600;
const SIDE_BY_SIDE_MIN_WIDTH = 900;

function calculateResponsive(): ResponsiveInfo {
  const { width, height } = Dimensions.get('window');
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);

  const isTablet =
    (minDim >= TABLET_MIN_WIDTH && maxDim >= TABLET_MIN_HEIGHT) ||
    Platform.OS === 'web';

  const isLandscape = width > height;

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

  return {
    isTablet,
    isLandscape,
    screenWidth: width,
    screenHeight: height,
    columns,
    maxContentWidth,
    sideBySide,
  };
}

export function useResponsive(): ResponsiveInfo {
  const [info, setInfo] = useState<ResponsiveInfo>(calculateResponsive);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      setInfo(calculateResponsive());
    });
    return () => subscription.remove();
  }, []);

  return info;
}

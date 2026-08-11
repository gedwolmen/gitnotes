import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarHeight } from '../ui/TabBar';
import {
  resolveFloatingAIButtonPlacement,
  type FloatingButtonGeometry,
  type FloatingButtonPosition,
} from './floatingAIButtonGeometry';

const EDGE_INSET = 16;
const MINIMUM_TOP_BOUND = 60;
const MINIMUM_BOTTOM_CLEARANCE = 100;
const STORAGE_KEY = 'ai-button-position';

export interface FloatingAIButtonPositionState {
  readonly geometry: FloatingButtonGeometry;
  readonly translateX: SharedValue<number>;
  readonly translateY: SharedValue<number>;
  readonly savedTranslateX: SharedValue<number>;
  readonly savedTranslateY: SharedValue<number>;
  readonly latestGeometry: SharedValue<FloatingButtonGeometry>;
  readonly dragActive: SharedValue<boolean>;
  readonly markPositionInteractionStarted: () => void;
  readonly savePosition: (position: FloatingButtonPosition) => void;
}

function isFloatingButtonPosition(value: unknown): value is FloatingButtonPosition {
  if (typeof value !== 'object' || value === null || !('x' in value) || !('y' in value)) {
    return false;
  }

  return typeof value.x === 'number'
    && Number.isFinite(value.x)
    && typeof value.y === 'number'
    && Number.isFinite(value.y);
}

export function useFloatingAIButtonPosition(): FloatingAIButtonPositionState {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const geometry = useMemo<FloatingButtonGeometry>(() => ({
    viewportWidth,
    viewportHeight,
    leftClearance: insets.left + EDGE_INSET,
    rightClearance: insets.right + EDGE_INSET,
    topBound: Math.max(MINIMUM_TOP_BOUND, insets.top + EDGE_INSET),
    tabBarHeight,
    minimumBottomClearance: Math.max(
      MINIMUM_BOTTOM_CLEARANCE,
      insets.bottom + EDGE_INSET,
    ),
  }), [
    insets.bottom,
    insets.left,
    insets.right,
    insets.top,
    tabBarHeight,
    viewportHeight,
    viewportWidth,
  ]);
  const geometryRef = useRef(geometry);
  const positionInteractionStartedRef = useRef(false);
  const [positionRestored, setPositionRestored] = useState(false);
  geometryRef.current = geometry;
  const initialPosition = resolveFloatingAIButtonPlacement(
    { x: viewportWidth, y: viewportHeight },
    geometry,
  ).position;
  const translateX = useSharedValue(initialPosition.x);
  const translateY = useSharedValue(initialPosition.y);
  const savedTranslateX = useSharedValue(initialPosition.x);
  const savedTranslateY = useSharedValue(initialPosition.y);
  const latestGeometry = useSharedValue(geometry);
  const dragActive = useSharedValue(false);

  const applyPosition = useCallback((position: FloatingButtonPosition) => {
    translateX.value = position.x;
    translateY.value = position.y;
    savedTranslateX.value = position.x;
    savedTranslateY.value = position.y;
  }, [savedTranslateX, savedTranslateY, translateX, translateY]);

  const savePosition = useCallback((position: FloatingButtonPosition) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(position)).catch((error: unknown) => {
      console.warn('Failed to save FAB position:', error);
    });
  }, []);

  const markPositionInteractionStarted = useCallback(() => {
    positionInteractionStartedRef.current = true;
  }, []);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(STORAGE_KEY).then((storedPosition) => {
      if (!isMounted) return;

      if (
        storedPosition !== null
        && !positionInteractionStartedRef.current
        && !dragActive.value
      ) {
        try {
          const parsedPosition: unknown = JSON.parse(storedPosition);
          if (isFloatingButtonPosition(parsedPosition)) {
            const normalizedPosition = resolveFloatingAIButtonPlacement(
              parsedPosition,
              geometryRef.current,
            ).position;
            applyPosition(normalizedPosition);
            if (
              normalizedPosition.x !== parsedPosition.x
              || normalizedPosition.y !== parsedPosition.y
            ) {
              savePosition(normalizedPosition);
            }
          }
        } catch (error: unknown) {
          console.warn('Failed to restore FAB position:', error);
        }
      }
      setPositionRestored(true);
    }).catch((error: unknown) => {
      if (!isMounted) return;
      console.warn('Failed to restore FAB position:', error);
      setPositionRestored(true);
    });

    return () => {
      isMounted = false;
    };
  }, [applyPosition, dragActive, savePosition]);

  useEffect(() => {
    latestGeometry.value = geometry;
  }, [geometry, latestGeometry]);

  useEffect(() => {
    if (!positionRestored || dragActive.value) return;

    const currentPosition = {
      x: savedTranslateX.value,
      y: savedTranslateY.value,
    };
    const normalizedPosition = resolveFloatingAIButtonPlacement(
      currentPosition,
      geometry,
    ).position;
    if (
      normalizedPosition.x === currentPosition.x
      && normalizedPosition.y === currentPosition.y
    ) {
      return;
    }

    applyPosition(normalizedPosition);
    savePosition(normalizedPosition);
  }, [
    applyPosition,
    dragActive,
    geometry,
    positionRestored,
    savedTranslateX,
    savedTranslateY,
    savePosition,
  ]);

  return {
    geometry,
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY,
    latestGeometry,
    dragActive,
    markPositionInteractionStarted,
    savePosition,
  };
}

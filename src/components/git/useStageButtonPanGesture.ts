import { useEffect } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withSpring } from 'react-native-reanimated';
import type { StageButtonPositionState } from './useStageButtonPosition';
import { resolveStageButtonPlacement, STAGE_BUTTON_SIZE } from './stageButtonGeometry';
import {
  getButtonRect,
  publishButtonRect,
  resolveNonOverlappingWithRect,
  subscribeButtonRects,
  type FloatingButtonRect,
} from '../floatingButtonLayout';

const POSITION_SPRING = {
  mass: 1,
  damping: 15,
  stiffness: 120,
  overshootClamping: true,
} as const;

export function useStageButtonPanGesture(position: StageButtonPositionState) {
  const {
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY,
    latestGeometry,
    dragActive,
    markPositionInteractionStarted,
    savePosition,
  } = position;
  const otherRect = useSharedValue<FloatingButtonRect | null>(null);

  useEffect(() => {
    otherRect.value = getButtonRect('ai');
    return subscribeButtonRects(() => {
      otherRect.value = getButtonRect('ai');
    });
  }, [otherRect]);

  return Gesture.Pan()
    .onBegin(() => {
      dragActive.value = true;
      runOnJS(markPositionInteractionStarted)();
    })
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd((_event, successful) => {
      if (!successful) return;

      const placement = resolveStageButtonPlacement(
        { x: translateX.value, y: translateY.value },
        latestGeometry.value,
      );
      const normalizedPosition = placement.position;
      const collisionFreePosition = resolveNonOverlappingWithRect(
        normalizedPosition,
        STAGE_BUTTON_SIZE,
        latestGeometry.value,
        otherRect.value,
      );

      translateX.value = withSpring(collisionFreePosition.x, POSITION_SPRING);
      translateY.value = withSpring(collisionFreePosition.y, POSITION_SPRING);
      savedTranslateX.value = collisionFreePosition.x;
      savedTranslateY.value = collisionFreePosition.y;

      runOnJS(savePosition)(collisionFreePosition);
      runOnJS(publishButtonRect)('stage', {
        x: collisionFreePosition.x,
        y: collisionFreePosition.y,
        size: STAGE_BUTTON_SIZE,
      });
    })
    .onFinalize((_event, successful) => {
      dragActive.value = false;
      if (successful) return;

      const savedPosition = {
        x: savedTranslateX.value,
        y: savedTranslateY.value,
      };
      const normalizedPosition = resolveStageButtonPlacement(
        savedPosition,
        latestGeometry.value,
      ).position;
      const collisionFreePosition = resolveNonOverlappingWithRect(
        normalizedPosition,
        STAGE_BUTTON_SIZE,
        latestGeometry.value,
        otherRect.value,
      );
      translateX.value = withSpring(collisionFreePosition.x, POSITION_SPRING);
      translateY.value = withSpring(collisionFreePosition.y, POSITION_SPRING);
      savedTranslateX.value = collisionFreePosition.x;
      savedTranslateY.value = collisionFreePosition.y;

      if (
        collisionFreePosition.x !== savedPosition.x
        || collisionFreePosition.y !== savedPosition.y
      ) {
        runOnJS(savePosition)(collisionFreePosition);
      }
      runOnJS(publishButtonRect)('stage', {
        x: collisionFreePosition.x,
        y: collisionFreePosition.y,
        size: STAGE_BUTTON_SIZE,
      });
    });
}

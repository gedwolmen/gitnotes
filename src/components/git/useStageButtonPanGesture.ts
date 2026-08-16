import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, withSpring } from 'react-native-reanimated';
import type { StageButtonPositionState } from './useStageButtonPosition';
import { resolveStageButtonPlacement } from './stageButtonGeometry';

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

      translateX.value = withSpring(normalizedPosition.x, POSITION_SPRING);
      translateY.value = withSpring(normalizedPosition.y, POSITION_SPRING);
      savedTranslateX.value = normalizedPosition.x;
      savedTranslateY.value = normalizedPosition.y;

      runOnJS(savePosition)(normalizedPosition);
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
      translateX.value = withSpring(normalizedPosition.x, POSITION_SPRING);
      translateY.value = withSpring(normalizedPosition.y, POSITION_SPRING);
      savedTranslateX.value = normalizedPosition.x;
      savedTranslateY.value = normalizedPosition.y;

      if (
        normalizedPosition.x !== savedPosition.x
        || normalizedPosition.y !== savedPosition.y
      ) {
        runOnJS(savePosition)(normalizedPosition);
      }
    });
}

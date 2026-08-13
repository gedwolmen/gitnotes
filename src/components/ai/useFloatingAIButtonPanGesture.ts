import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, withSpring } from 'react-native-reanimated';
import type { FloatingAIButtonPositionState } from './useFloatingAIButtonPosition';
import {
  resolveFloatingAIButtonPlacement,
  type MenuDirection,
} from './floatingAIButtonGeometry';

const POSITION_SPRING = {
  mass: 1,
  damping: 15,
  stiffness: 120,
  overshootClamping: true,
} as const;

interface FloatingAIButtonPanActions {
  readonly closeMenu: () => void;
  readonly setHorizontalDirection: (direction: MenuDirection) => void;
  readonly setVerticalDirection: (direction: MenuDirection) => void;
  readonly cancelAffordances: () => void;
}

export function useFloatingAIButtonPanGesture(
  position: FloatingAIButtonPositionState,
  actions: FloatingAIButtonPanActions,
) {
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
      runOnJS(actions.cancelAffordances)();
    })
    .onStart(() => {
      runOnJS(actions.closeMenu)();
    })
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd((_event, successful) => {
      if (!successful) return;

      const placement = resolveFloatingAIButtonPlacement(
        { x: translateX.value, y: translateY.value },
        latestGeometry.value,
      );
      const normalizedPosition = placement.position;

      translateX.value = withSpring(normalizedPosition.x, POSITION_SPRING);
      translateY.value = withSpring(normalizedPosition.y, POSITION_SPRING);
      savedTranslateX.value = normalizedPosition.x;
      savedTranslateY.value = normalizedPosition.y;

      runOnJS(actions.setHorizontalDirection)(placement.horizontalDirection);
      runOnJS(actions.setVerticalDirection)(placement.verticalDirection);
      runOnJS(savePosition)(normalizedPosition);
    })
    .onFinalize((_event, successful) => {
      dragActive.value = false;
      if (successful) return;

      const savedPosition = {
        x: savedTranslateX.value,
        y: savedTranslateY.value,
      };
      const normalizedPosition = resolveFloatingAIButtonPlacement(
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

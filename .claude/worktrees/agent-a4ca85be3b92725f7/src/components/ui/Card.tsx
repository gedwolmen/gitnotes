import React, { ReactNode, useCallback, useState } from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Surface } from './Surface';
import { useTokens } from '../../contexts/ThemeContext';
import { Radius } from '../../theme/tokens';

export interface CardProps {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  radius?: Radius;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
}

export function Card(props: CardProps) {
  const { onPress, onLongPress, disabled, radius = 'lg', padding, style, testID, children } = props;
  const { spacing } = useTokens();
  const [isPressed, setIsPressed] = useState(false);
  const scale = useSharedValue(1);
  const interactive = !!onPress || !!onLongPress;

  const handlePressIn = useCallback(() => {
    if (!interactive) return;
    scale.value = withSpring(0.98, { mass: 0.4, damping: 14, stiffness: 220 });
    setIsPressed(true);
    Haptics.selectionAsync().catch(() => undefined);
  }, [scale, interactive]);

  const handlePressOut = useCallback(() => {
    if (!interactive) return;
    scale.value = withSpring(1, { mass: 0.4, damping: 14, stiffness: 220 });
    setIsPressed(false);
  }, [scale, interactive]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const surface = (
    <Surface
      elevation="raised"
      radius={radius}
      inset={isPressed}
      style={[{ padding: padding ?? spacing[4] }, style]}
    >
      {children}
    </Surface>
  );

  if (!interactive) {
    return surface;
  }

  return (
    <Animated.View style={[animatedStyle, { opacity: disabled ? 0.5 : 1 }]}>
      <Pressable
        testID={testID}
        onPress={disabled ? undefined : onPress}
        onLongPress={disabled ? undefined : onLongPress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        disabled={disabled}
      >
        {surface}
      </Pressable>
    </Animated.View>
  );
}

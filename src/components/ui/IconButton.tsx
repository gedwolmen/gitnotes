import React, { ReactNode, useCallback, useState } from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Surface } from './Surface';
import { useTokens } from '../../contexts/ThemeContext';

export type IconButtonSize = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<IconButtonSize, number> = { sm: 36, md: 44, lg: 56 };

export interface IconButtonProps {
  onPress?: () => void;
  onLongPress?: () => void;
  size?: IconButtonSize;
  disabled?: boolean;
  active?: boolean;
  variant?: 'default' | 'primary' | 'ghost';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  children: ReactNode;
}

export function IconButton(props: IconButtonProps) {
  const {
    onPress,
    onLongPress,
    size = 'md',
    disabled = false,
    active = false,
    variant = 'default',
    style,
    testID,
    accessibilityLabel,
    children,
  } = props;
  const { spacing } = useTokens();
  const dim = SIZE_MAP[size];
  const [isPressed, setIsPressed] = useState(false);
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.94, { mass: 0.4, damping: 14, stiffness: 240 });
    setIsPressed(true);
    if (variant !== 'ghost') {
      Haptics.selectionAsync().catch(() => undefined);
    }
  }, [scale, variant]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { mass: 0.4, damping: 14, stiffness: 240 });
    setIsPressed(false);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (variant === 'ghost') {
    return (
      <Animated.View style={[{ opacity: disabled ? 0.5 : 1 }, animatedStyle]}>
        <Pressable
          testID={testID}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          onPress={disabled ? undefined : onPress}
          onLongPress={disabled ? undefined : onLongPress}
          onPressIn={disabled ? undefined : handlePressIn}
          onPressOut={disabled ? undefined : handlePressOut}
          disabled={disabled}
          hitSlop={4}
          style={[
            {
              width: dim,
              height: dim,
            },
            style,
          ]}
          className="items-center justify-center"
        >
          {children}
        </Pressable>
      </Animated.View>
    );
  }

  const inset = isPressed || active;
  const elevation = variant === 'primary' ? 'raised' : 'raised';

  return (
    <Animated.View style={[{ opacity: disabled ? 0.5 : 1 }, animatedStyle]}>
      <Pressable
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={disabled ? undefined : onPress}
        onLongPress={disabled ? undefined : onLongPress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        disabled={disabled}
      >
        <Surface
          elevation={elevation}
          radius="pill"
          inset={inset}
          style={[
            {
              width: dim,
              height: dim,
              padding: spacing[2],
            },
            style,
          ]}
          className="items-center justify-center"
        >
          {children}
        </Surface>
      </Pressable>
    </Animated.View>
  );
}

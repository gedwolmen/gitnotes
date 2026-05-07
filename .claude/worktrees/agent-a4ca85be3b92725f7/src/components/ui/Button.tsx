import React, { ReactNode, useCallback, useState } from 'react';
import { Pressable, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Surface } from './Surface';
import { useTokens } from '../../contexts/ThemeContext';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  label?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  iconAlign?: 'inline' | 'edge';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  children?: ReactNode;
}

export function Button(props: ButtonProps) {
  const {
    label,
    onPress,
    onLongPress,
    variant = 'secondary',
    disabled = false,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    iconAlign = 'inline',
    style,
    textStyle,
    testID,
    children,
  } = props;
  const { colors, radii, spacing, type } = useTokens();
  const [isPressed, setIsPressed] = useState(false);
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.97, { mass: 0.4, damping: 14, stiffness: 220 });
    setIsPressed(true);
    Haptics.selectionAsync().catch(() => undefined);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { mass: 0.4, damping: 14, stiffness: 220 });
    setIsPressed(false);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Primary button text uses colors.text, not colors.accent — accent on
  // a light Surface fails WCAG AA body-text contrast (~3:1). The button's
  // raised Surface + the accent-colored leading icon carry the "primary"
  // affordance instead. (See #221.)
  const textColor = colors.text;
  const isGhost = variant === 'ghost';

  const labelNode = label !== undefined && (
    <Text
      style={[
        { color: textColor, fontSize: type.md, fontWeight: variant === 'primary' ? '600' : '500' },
        textStyle,
      ]}
    >
      {label}
    </Text>
  );

  const childrenNode = typeof children === 'string' ? (
    <Text
      style={[
        { color: textColor, fontSize: type.md, fontWeight: variant === 'primary' ? '600' : '500' },
        textStyle,
      ]}
    >
      {children}
    </Text>
  ) : children;

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: iconAlign === 'edge' ? spacing[3] : spacing[2] }}>
      {leadingIcon}
      {labelNode}
      {childrenNode}
      {trailingIcon}
    </View>
  );

  if (isGhost) {
    return (
      <Pressable
        testID={testID}
        onPress={disabled ? undefined : onPress}
        onLongPress={disabled ? undefined : onLongPress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        disabled={disabled}
        style={({ pressed }) => [
          {
            opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
            paddingVertical: spacing[2],
            paddingHorizontal: spacing[3],
            borderRadius: radii.md,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: fullWidth ? 'stretch' : 'auto',
          },
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <Animated.View style={[{ alignSelf: fullWidth ? 'stretch' : 'auto', opacity: disabled ? 0.5 : 1 }, animatedStyle]}>
      <Pressable
        testID={testID}
        onPress={disabled ? undefined : onPress}
        onLongPress={disabled ? undefined : onLongPress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        disabled={disabled}
      >
        <Surface
          elevation="raised"
          radius="md"
          inset={isPressed}
          style={[
            {
              paddingVertical: spacing[3],
              paddingHorizontal: spacing[5],
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
            },
            style,
          ]}
        >
          {content}
        </Surface>
      </Pressable>
    </Animated.View>
  );
}

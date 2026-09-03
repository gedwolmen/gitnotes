import React, { ReactNode, useCallback, useState } from 'react';
import { Pressable, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Surface } from './Surface';
import { useTokens, useTheme } from '../../contexts/ThemeContext';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';

export { ButtonText } from './text';

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
  size?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
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
    size,
    className,
    style,
    textStyle,
    testID,
    accessibilityLabel,
    children,
  } = props;
  const { colors, type } = useTokens();
  const { style: themeStyle } = useTheme();
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

  const textColor = variant === 'primary' ? '#fff' : colors.text;
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
    <View className={cn(
      'flex-row items-center justify-center',
      iconAlign === 'edge' ? 'gap-3' : 'gap-2'
    )}>
      {leadingIcon}
      {labelNode}
      {childrenNode}
      {trailingIcon}
    </View>
  );

  // An edge icon (leading or trailing) optically shifts the centered label:
  // the icon adds width to one side, so the text sits off the button's true
  // center. Pin the icon(s) to the edge (absolute) and reserve the same space
  // on both sides so the label stays dead-center. This fixes the trailing
  // onboarding "Next" bug and the leading-icon "New Chat" button, which
  // rendered its label ~half-an-icon right of center with inline alignment.
  //
  // iconAlign="edge" keeps that behavior for wide/fullWidth buttons where the
  // pinned icon has room. iconAlign="inline" (default) renders the icon next
  // to the label in the flex row instead — needed for narrow buttons (e.g. the
  // header "Save" button) where the absolutely-pinned icon overlaps the text.
  const hasLeadingIcon = leadingIcon != null;
  const hasTrailingIcon = trailingIcon != null;
  const useEdgeIcon = (hasLeadingIcon || hasTrailingIcon) && iconAlign === 'edge';
  const centeredContent = (
    <View className="flex-row items-center justify-center">
      <View style={{ width: hasLeadingIcon || hasTrailingIcon ? 20 : 0 }} />
      {labelNode}
      {childrenNode}
      <View style={{ width: hasLeadingIcon || hasTrailingIcon ? 20 : 0 }} />
    </View>
  );
  const edgeLeadingIcon = hasLeadingIcon ? (
    <View className="absolute left-5">
      {leadingIcon}
    </View>
  ) : null;
  const edgeIcon = hasTrailingIcon ? (
    <View className="absolute right-5">
      {trailingIcon}
    </View>
  ) : null;

  if (isGhost) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={disabled ? undefined : onPress}
        onLongPress={disabled ? undefined : onLongPress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        disabled={disabled}
        style={({ pressed }) => [
          {
            opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          },
          style,
        ]}
        className={cn(
          'py-2 px-3 rounded-md items-center justify-center',
          fullWidth && 'self-stretch',
          className
        )}
      >
        {useEdgeIcon ? (
          <>
            {centeredContent}
            {edgeLeadingIcon}
            {edgeIcon}
          </>
        ) : content}
      </Pressable>
    );
  }

  return (
    <Animated.View style={[{ opacity: disabled ? 0.5 : 1 }, animatedStyle]} className={cn(fullWidth && 'self-stretch', className)}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={disabled ? undefined : onPress}
        onLongPress={disabled ? undefined : onLongPress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        disabled={disabled}
        style={fullWidth ? { alignSelf: 'stretch' } : undefined}
      >
        <Surface
          elevation={themeStyle === 'flat' || variant === 'primary' ? 'flat' : 'raised'}
          radius="md"
          inset={isPressed}
          style={[
            {
              minHeight: 44,
              alignSelf: 'stretch',
            },
            // variant="primary" carries a filled primary background; the
            // raised Surface alone renders a white card, which made primary
            // labels overridden to white invisible (white-on-white).
            variant === 'primary'
              ? { backgroundColor: colors.primary }
              : variant === 'outline'
                ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }
                : { backgroundColor: colors.surface },
            style,
          ]}
        >
          <View className="py-3 px-5 items-center justify-center self-stretch">
            {useEdgeIcon ? (
              <>
                {centeredContent}
                {edgeLeadingIcon}
                {edgeIcon}
              </>
            ) : content}
          </View>
        </Surface>
      </Pressable>
    </Animated.View>
  );
}

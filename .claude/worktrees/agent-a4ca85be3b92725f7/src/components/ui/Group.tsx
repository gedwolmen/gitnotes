import React, { Fragment, ReactNode } from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { Surface } from './Surface';
import { useTokens } from '../../contexts/ThemeContext';

export interface GroupProps {
  title?: string;
  footer?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function Group(props: GroupProps) {
  const { title, footer, style, children } = props;
  const { colors, spacing, type } = useTokens();
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={[{ gap: spacing[2] }, style]}>
      {title && (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: type.sm,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            marginLeft: spacing[3],
          }}
        >
          {title}
        </Text>
      )}
      <Surface elevation="raised" radius="lg" style={{ overflow: 'hidden' }}>
        {items.map((child, idx) => {
          const childKey =
            React.isValidElement(child) && child.key != null
              ? `c-${child.key}`
              : `i-${idx}`;
          return (
            <Fragment key={childKey}>
              {idx > 0 && (
                <View
                  style={{
                    height: 1,
                    marginLeft: spacing[4],
                    backgroundColor: colors.shadow,
                    opacity: 0.18,
                  }}
                />
              )}
              {child}
            </Fragment>
          );
        })}
      </Surface>
      {footer && (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: type.xs,
            marginHorizontal: spacing[3],
            marginTop: spacing[1],
          }}
        >
          {footer}
        </Text>
      )}
    </View>
  );
}

export interface GroupRowProps {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}

export function GroupRow(props: GroupRowProps) {
  const { onPress, onLongPress, disabled, leading, trailing, style, children, testID } = props;
  const { colors, spacing } = useTokens();

  const content = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3],
          minHeight: 48,
          gap: spacing[3],
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {leading}
      <View style={{ flex: 1 }}>{children}</View>
      {trailing}
    </View>
  );

  if (!onPress && !onLongPress) return content;

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      disabled={disabled}
      android_ripple={{ color: colors.shadow + '20' }}
      style={({ pressed }) => ({ backgroundColor: pressed ? colors.shadow + '14' : 'transparent' })}
    >
      {content}
    </Pressable>
  );
}

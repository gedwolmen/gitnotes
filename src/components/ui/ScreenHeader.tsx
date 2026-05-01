import React, { ReactNode } from 'react';
import { Text, View, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTokens } from '../../contexts/ThemeContext';
import { IconButton } from './IconButton';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader(props: ScreenHeaderProps) {
  const { title, subtitle, onBack, actions, style } = props;
  const { colors, spacing, type } = useTokens();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing[4],
          paddingTop: spacing[3],
          paddingBottom: spacing[3],
          gap: spacing[3],
        },
        style,
      ]}
    >
      {onBack && (
        <IconButton size="sm" onPress={onBack} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={18} color={colors.accent} />
        </IconButton>
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: type['2xl'],
            fontWeight: '700',
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: type.sm,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {actions && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          {actions}
        </View>
      )}
    </View>
  );
}

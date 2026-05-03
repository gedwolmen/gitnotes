import React, { ReactNode } from 'react';
import { Platform, Text, View, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useTokens } from '../../contexts/ThemeContext';
import { IconButton } from './IconButton';

export const SCREEN_HEADER_BASE_HEIGHT = 88;

/**
 * Total reserved space for the floating ScreenHeader, including the
 * top safe-area inset. Use as `paddingTop` on the screen's first
 * scroll/list container so content can scroll behind the bar without
 * being permanently hidden under it.
 */
export function useScreenHeaderHeight(): number {
  const insets = useSafeAreaInsets();
  return insets.top + SCREEN_HEADER_BASE_HEIGHT;
}

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  onBack?: () => void;
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader(props: ScreenHeaderProps) {
  const { title, subtitle, badge, onBack, actions, style } = props;
  const { isDark } = useTheme();
  const { colors, spacing, type } = useTokens();
  const insets = useSafeAreaInsets();

  return (
    <BlurView
      pointerEvents="box-none"
      intensity={Platform.OS === 'ios' ? 60 : 30}
      tint={isDark ? 'dark' : 'light'}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: insets.top,
        zIndex: 10,
      }}
    >
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Text
              style={{
                color: colors.text,
                fontSize: type['2xl'],
                fontWeight: '700',
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
            {badge && (
              <View
                style={{
                  backgroundColor: '#3B82F6',
                  paddingHorizontal: spacing[2],
                  paddingVertical: 2,
                  borderRadius: 6,
                }}
              >
                <Text
                  style={{
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: '800',
                    letterSpacing: 0.5,
                  }}
                >
                  {badge}
                </Text>
              </View>
            )}
          </View>
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
    </BlurView>
  );
}

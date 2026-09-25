import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

export type HomeTileVariant = 'primary' | 'secondary' | 'accent';

/** Tile height per variant and layout context */
export const HOME_TILE_HEIGHT: Record<HomeTileVariant, number> = {
  primary: 130,
  secondary: 56,
  accent: 130,
};

/** Tile border-radius per variant */
export const HOME_TILE_RADIUS: Record<HomeTileVariant, number> = {
  primary: 20,
  secondary: 16,
  accent: 20,
};

interface HomeTileProps {
  /** Visual hierarchy variant */
  variant: HomeTileVariant;
  /** Ionicons glyph map key for the icon */
  icon: keyof typeof Ionicons.glyphMap;
  /** Icon color — defaults to appropriate contrast color per variant */
  iconColor?: string;
  /** Badge background color — defaults per variant */
  badgeColor?: string;
  /** Badge size — defaults to 36 for primary/accent, 40 for secondary */
  badgeSize?: number;
  /** Title text (omit when using titleNode) */
  title?: string;
  /** Subtitle/description text */
  subtitle?: string;
  /** Show tablet background decoration (large faint icon) */
  showTabletDecoration?: boolean;
  /** Press handler */
  onPress: () => void;
  /** Long press handler */
  onLongPress?: () => void;
  /** Explicit height override */
  height?: number;
  /** testID for the pressable */
  testID?: string;
  /** Whether the tile is disabled */
  disabled?: boolean;
  /** Content node for title slot (allows rich formatting) */
  titleNode?: ReactNode;
  /** Subtitle content node */
  subtitleNode?: ReactNode;
  /** Additional content below title (for custom layout) */
  children?: ReactNode;
  /** How to position content area vertically: 'flex-end' (default) or 'space-between' */
  contentPosition?: 'flex-end' | 'space-between';
  /** Title text style override (e.g. { fontSize: 16 } for secondary tiles) */
  titleStyle?: object;
  /** Subtitle numberOfLines (default 1) */
  subtitleLines?: number;
}

/**
 * Shared home dashboard tile composition.
 *
 * Replaces the repeated inline tile recipes in HomeScreen:
 * - primary variant: create-note, journal tiles (primary bg, white text)
 * - secondary variant: calendar strip (surface bg, bordered, 56px tall)
 * - accent variant: thought-dump tile (accent bg, white text)
 *
 * Press behavior (opacity 0.92 + scale 0.985) is consistent across all variants.
 * Intentional white-on-colored-background exceptions are preserved.
 */
export function HomeTile({
  variant,
  icon,
  iconColor,
  badgeColor,
  badgeSize,
  title,
  subtitle,
  showTabletDecoration = false,
  onPress,
  onLongPress,
  height,
  testID,
  disabled,
  titleNode,
  subtitleNode,
  children,
  contentPosition = 'flex-end',
  titleStyle,
  subtitleLines = 1,
}: HomeTileProps) {
  const { colors } = useTheme();
  const tileHeight = height ?? HOME_TILE_HEIGHT[variant];
  const tileRadius = HOME_TILE_RADIUS[variant];

  // Variant-driven defaults
  const isColored = variant === 'primary' || variant === 'accent';
  const bgColor = isColored
    ? (variant === 'primary' ? colors.primary : colors.accent)
    : colors.surface;
  const titleColor = isColored ? '#FFFFFF' : colors.text;
  const subtitleColor = isColored ? 'rgba(255,255,255,0.85)' : colors.textSecondary;

  // Badge defaults
  const isSmallBadge = variant === 'secondary';
  const finalBadgeSize = badgeSize ?? (isSmallBadge ? 40 : 36);
  const finalBadgeColor = badgeColor ?? (isColored ? 'rgba(255,255,255,0.2)' : colors.primary + '1F');
  const finalIconColor = iconColor ?? (isColored ? '#FFFFFF' : colors.primary);
  const badgeRadius = isSmallBadge ? 20 : 18;

  // Icon size scales with badge
  const iconSize = Math.round(finalBadgeSize * 0.5);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.tile,
        {
          height: tileHeight,
          borderRadius: tileRadius,
          backgroundColor: bgColor,
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
          borderColor: variant === 'secondary' ? colors.border : undefined,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        } as ViewStyle,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title ?? 'tile'}
    >
      {/* Tablet decoration: large faint icon in top-right corner */}
      {showTabletDecoration && (
        <View style={styles.decoration} pointerEvents="none">
          <Ionicons name={icon} size={120} color="#FFFFFF" style={{ opacity: 0.3 }} />
        </View>
      )}

      {/* Icon badge */}
      <View
        style={[
          styles.badge,
          {
            width: finalBadgeSize,
            height: finalBadgeSize,
            borderRadius: badgeRadius,
            backgroundColor: finalBadgeColor,
          },
        ]}
      >
        <Ionicons name={icon} size={iconSize} color={finalIconColor} />
      </View>

      {/* Content area */}
      <View style={contentPosition === 'space-between' ? styles.contentSpaceBetween : styles.content}>
        {titleNode ?? (
          <Text
            style={[styles.title, titleStyle, { color: titleColor }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        )}
        {subtitleNode ?? (
          subtitle ? (
            <Text
              style={[styles.subtitle, { color: subtitleColor }]}
              numberOfLines={subtitleLines}
            >
              {subtitle}
            </Text>
          ) : null
        )}
        {children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    padding: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  badge: {
    position: 'absolute',
    top: 16,
    left: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decoration: {
    position: 'absolute',
    top: -50,
    right: -50,
  },
  content: {
    gap: 4,
  },
  contentSpaceBetween: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default HomeTile;

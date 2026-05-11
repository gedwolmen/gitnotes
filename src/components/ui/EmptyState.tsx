import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** Overrides the default `colors.textSecondary` icon color. */
  iconColor?: string;
  /** Optional testID to make the empty state targetable in tests. */
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared empty-state block for list screens.
 *
 * Before this component, every list screen (notes, todos, templates, chat
 * threads, explore, …) rolled its own combination of icon size, font
 * weight, and spacing. The result looked subtly different on every tab.
 * Centralise the typography here so the empty messages match.
 */
export function EmptyState({ icon, title, subtitle, iconColor, testID, style }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]} testID={testID}>
      <Ionicons name={icon} size={48} color={iconColor ?? colors.textSecondary} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
});

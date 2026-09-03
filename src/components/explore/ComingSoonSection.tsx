import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { useTokens } from '@/contexts/ThemeContext';

/**
 * Placeholder card for sections whose real data lands later
 * (Pull Requests + Issues REST = todo 26).
 */
export function ComingSoonSection({
  title,
  icon,
  todo,
  testID,
  chromeTopInset = 0,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  todo: number;
  testID: string;
  chromeTopInset?: number;
}) {
  const { colors } = useTokens();
  return (
    <View className="px-4" style={{ paddingTop: chromeTopInset }}>
      <View className="items-center rounded-sm px-6 py-10" style={{ borderColor: colors.border, borderWidth: 1, borderStyle: 'dashed', backgroundColor: colors.surface }} testID={testID}>
        <Ionicons name={icon} size={40} color={colors.textSecondary} />
        <Text className="mt-3 text-base font-bold" style={{ color: colors.text }}>{title}</Text>
        <View className="mt-1.5 rounded px-2 py-0.5" style={{ backgroundColor: `${colors.accent}26` }}>
          <Text className="text-[11px] font-semibold" style={{ color: colors.accent }}>coming soon</Text>
        </View>
        <Text className="mt-3 text-center text-xs" style={{ color: colors.textSecondary }}>
          Provider REST data for {title.toLowerCase()} arrives with todo {todo}. The shell
          section is ready to host it.
        </Text>
      </View>
    </View>
  );
}

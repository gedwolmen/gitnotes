import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';

/**
 * Placeholder card for sections whose real data lands later
 * (Pull Requests + Issues REST = todo 26).
 */
export function ComingSoonSection({
  title,
  icon,
  todo,
  testID,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  todo: number;
  testID: string;
}) {
  return (
    <View className="px-4 pt-4">
      <View className="items-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-10" testID={testID}>
        <Ionicons name={icon} size={40} color="#9ca3af" />
        <Text className="mt-3 text-base font-bold text-black">{title}</Text>
        <View className="mt-1.5 rounded bg-indigo-100 px-2 py-0.5">
          <Text className="text-[11px] font-semibold text-indigo-700">coming soon</Text>
        </View>
        <Text className="mt-3 text-center text-xs text-gray-500">
          Provider REST data for {title.toLowerCase()} arrives with todo {todo}. The shell
          section is ready to host it.
        </Text>
      </View>
    </View>
  );
}

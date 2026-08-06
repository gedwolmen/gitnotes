import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  iconColor?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon, title, subtitle, iconColor, testID, style }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View
      className="flex-1 items-center justify-center py-16 px-6"
      style={style}
      testID={testID}
    >
      <Ionicons name={icon} size={48} color={iconColor ?? colors.textSecondary} />
      <Text className="text-[17px] font-semibold mt-4 text-center text-text" style={{ color: colors.text }}>
        {title}
      </Text>
      {subtitle ? (
        <Text className="text-sm mt-1.5 text-center" style={{ color: colors.textSecondary }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useTokens } from '../../contexts/ThemeContext';
import type { SectionTabColor } from '../explore/exploreShared';

export interface SectionTab {
  id: string;
  label: string;
  color?: SectionTabColor;
}

interface SectionTabsProps {
  tabs: readonly SectionTab[];
  value: string;
  onChange: (id: string) => void;
  testID?: string;
}

const COLOR_MAP: Record<SectionTabColor, keyof ReturnType<typeof useTokens>['colors']> = {
  success: 'success',
  warning: 'warning',
  primary: 'primary',
  accent: 'accent',
};

export function SectionTabs({ tabs, value, onChange, testID }: SectionTabsProps) {
  const { colors } = useTokens();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: 'row', gap: 0 }}
      style={{ flexGrow: 0 }}
      testID={testID}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === value;
        const activeColor = tab.color ? colors[COLOR_MAP[tab.color]] : colors.accent;
        return (
          <Pressable
            key={tab.id}
            testID={`explore.tab.${tab.id}`}
            onPress={() => onChange(tab.id)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderBottomWidth: 2,
              borderBottomColor: isActive ? activeColor : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: isActive ? '600' : '500',
                color: isActive ? activeColor : colors.textSecondary,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme, useTokens } from '../../contexts/ThemeContext';

export interface SectionTab {
  id: string;
  label: string;
}

interface SectionTabsProps {
  tabs: readonly SectionTab[];
  value: string;
  onChange: (id: string) => void;
  testID?: string;
}

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
        return (
          <Pressable
            key={tab.id}
            testID={`explore.tab.${tab.id}`}
            onPress={() => onChange(tab.id)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderBottomWidth: 2,
              borderBottomColor: isActive ? colors.accent : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: isActive ? '600' : '500',
                color: isActive ? colors.accent : colors.textSecondary,
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

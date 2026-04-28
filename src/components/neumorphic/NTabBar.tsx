import React from 'react';
import { Pressable, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Surface } from './Surface';
import { useTokens } from '../../contexts/ThemeContext';

const TAB_ICONS: Record<string, { focused: string; outline: string; label: string }> = {
  HomeTab: { focused: 'home', outline: 'home-outline', label: 'Home' },
  NotesTab: { focused: 'document-text', outline: 'document-text-outline', label: 'Notes' },
  ExploreTab: { focused: 'compass', outline: 'compass-outline', label: 'Explore' },
  TodosTab: { focused: 'checkbox', outline: 'checkbox-outline', label: 'Todos' },
  SettingsTab: { focused: 'settings', outline: 'settings-outline', label: 'Settings' },
};

export function NTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, spacing } = useTokens();

  return (
    <View
      style={{
        backgroundColor: colors.bg,
        paddingHorizontal: spacing[6],
        paddingBottom: insets.bottom + spacing[3],
        paddingTop: spacing[4],
      }}
    >
      <Surface
        elevation="floating"
        radius="pill"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingVertical: spacing[2],
          paddingHorizontal: spacing[3],
        }}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const config = TAB_ICONS[route.name];
          if (!config) return null;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={config.label}
              onPress={onPress}
              onLongPress={onLongPress}
              hitSlop={6}
            >
              <Surface
                elevation="subtle"
                radius="pill"
                inset={isFocused}
                style={{
                  width: 48,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={(isFocused ? config.focused : config.outline) as any}
                  size={22}
                  color={isFocused ? colors.accent : colors.textSecondary}
                />
              </Surface>
            </Pressable>
          );
        })}
      </Surface>
    </View>
  );
}

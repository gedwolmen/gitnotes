import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Surface } from './Surface';
import { useTheme, useTokens } from '../../contexts/ThemeContext';

type IoniconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { focused: IoniconName; outline: IoniconName; label: string }> = {
  HomeTab: { focused: 'home', outline: 'home-outline', label: 'Home' },
  NotesTab: { focused: 'document-text', outline: 'document-text-outline', label: 'Notes' },
  ExploreTab: { focused: 'compass', outline: 'compass-outline', label: 'Explore' },
  TodosTab: { focused: 'checkbox', outline: 'checkbox-outline', label: 'Todos' },
  SettingsTab: { focused: 'settings', outline: 'settings-outline', label: 'Settings' },
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, spacing } = useTokens();
  const { isDark } = useTheme();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: spacing[6],
        paddingBottom: insets.bottom + spacing[3],
        paddingTop: spacing[4],
        backgroundColor: 'transparent',
      }}
    >
      <BlurView
        intensity={Platform.OS === 'ios' ? 60 : 30}
        tint={isDark ? 'dark' : 'light'}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingVertical: spacing[2],
          paddingHorizontal: spacing[3],
          borderRadius: 999,
          overflow: 'hidden',
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
                  backgroundColor: 'transparent',
                }}
              >
                <Ionicons
                  name={isFocused ? config.focused : config.outline}
                  size={22}
                  color={isFocused ? colors.accent : colors.textSecondary}
                />
              </Surface>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

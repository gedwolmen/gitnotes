import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Surface } from './Surface';
import { useTheme, useTokens } from '../../contexts/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';

type IoniconName = keyof typeof Ionicons.glyphMap;

export const TAB_BAR_BASE_HEIGHT = 84;

/**
 * Reserved space *above* the floating TabBar that callers should add as
 * extra `paddingBottom` on scroll containers, or as `bottomOffset` on
 * absolutely-positioned overlays inside a tab screen. Returns 0 when the
 * tab screen renders ABOVE the system tab bar (default React Navigation
 * bar, or the iPad rail) — in that case the screen's bottom edge already
 * sits at the tab bar's top, so adding TAB_BAR_BASE_HEIGHT again pushed
 * floating UI a full bar's height too high.
 */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  const { style } = useTheme();
  const { isTablet } = useResponsive();
  const useFloatingBar = !isTablet && style === 'neumorphic';
  if (!useFloatingBar) return 0;
  return insets.bottom + TAB_BAR_BASE_HEIGHT;
}

const TAB_ICONS: Record<string, { focused: IoniconName; outline: IoniconName; labelKey: string }> = {
  HomeTab: { focused: 'home', outline: 'home-outline', labelKey: 'tabs.home' },
  NotesTab: { focused: 'document-text', outline: 'document-text-outline', labelKey: 'tabs.notes' },
  ExploreTab: { focused: 'compass', outline: 'compass-outline', labelKey: 'tabs.explore' },
  TodosTab: { focused: 'checkbox', outline: 'checkbox-outline', labelKey: 'tabs.todos' },
  SettingsTab: { focused: 'settings', outline: 'settings-outline', labelKey: 'tabs.settings' },
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, spacing } = useTokens();
  const { isDark } = useTheme();
  const { t } = useTranslation();

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
        pointerEvents="box-none"
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
              testID={`tab-bar.tab.press-${route.name}`}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={t(config.labelKey)}
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

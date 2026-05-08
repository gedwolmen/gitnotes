import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import HomeScreen from '../screens/HomeScreen';
import NotesListScreen from '../screens/NotesListScreen';
import ExploreScreen from '../screens/ExploreScreen';
import TodoListScreen from '../screens/TodoListScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { BottomTabParamList } from './types';
import { useResponsive } from '../hooks/useResponsive';
import { useTheme } from '../contexts/ThemeContext';
import { TabBar } from '../components/ui';

const Tab = createBottomTabNavigator<BottomTabParamList>();

type IoniconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { focused: IoniconName; outline: IoniconName; labelKey: string }> = {
  HomeTab: { focused: 'home', outline: 'home-outline', labelKey: 'tabs.home' },
  NotesTab: { focused: 'document-text', outline: 'document-text-outline', labelKey: 'tabs.notes' },
  ExploreTab: { focused: 'compass', outline: 'compass-outline', labelKey: 'tabs.explore' },
  TodosTab: { focused: 'checkbox', outline: 'checkbox-outline', labelKey: 'tabs.todos' },
  SettingsTab: { focused: 'settings', outline: 'settings-outline', labelKey: 'tabs.settings' },
};

function TabletRail({ state, navigation }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        railStyles.rail,
        {
          backgroundColor: isDark ? '#1c1c1e' : '#f8f8f8',
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + 6,
        },
      ]}
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
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TouchableOpacity
              key={route.key}
              testID={`tab-bar-nav.tab.press-${route.name}`}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={t(config.labelKey)}
              style={[
                railStyles.tab,
                isFocused && {
                  backgroundColor: colors.primary + '18',
                  borderRadius: 12,
                },
              ]}
              onPress={onPress}
              onLongPress={onLongPress}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isFocused ? config.focused : config.outline}
                size={26}
                color={isFocused ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  railStyles.label,
                  { color: isFocused ? colors.primary : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {t(config.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
    </View>
  );
}

const railStyles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginHorizontal: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
});

export default function TabNavigator() {
  const { isTablet } = useResponsive();
  const { style, colors } = useTheme();
  const useNeumorphicBar = !isTablet && style === 'neumorphic';

  return (
    <Tab.Navigator
      tabBar={
        isTablet
          ? (props) => <TabletRail {...props} />
          : useNeumorphicBar
            ? (props) => <TabBar {...props} />
            : undefined
      }
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const config = TAB_ICONS[route.name];
          if (!config) return null;
          const iconName = focused ? config.focused : config.outline;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="NotesTab"
        component={NotesListScreen}
        options={{ title: 'Notes' }}
      />
      <Tab.Screen
        name="ExploreTab"
        component={ExploreScreen}
        options={{ title: 'Explore' }}
      />
      <Tab.Screen
        name="TodosTab"
        component={TodoListScreen}
        options={{ title: 'Todos' }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

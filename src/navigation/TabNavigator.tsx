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
import { SafeAreaView } from 'react-native-safe-area-context';

import HomeScreen from '../screens/HomeScreen';
import NotesListScreen from '../screens/NotesListScreen';
import ExploreScreen from '../screens/ExploreScreen';
import JournalScreen from '../screens/JournalScreen';
import TodoListScreen from '../screens/TodoListScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { BottomTabParamList } from './types';
import { useResponsive } from '../hooks/useResponsive';
import { useTheme } from '../contexts/ThemeContext';
import { TabBar } from '../components/ui';

const Tab = createBottomTabNavigator<BottomTabParamList>();

type IoniconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { focused: IoniconName; outline: IoniconName; label: string }> = {
  HomeTab: { focused: 'home', outline: 'home-outline', label: 'Home' },
  NotesTab: { focused: 'document-text', outline: 'document-text-outline', label: 'Notes' },
  ExploreTab: { focused: 'compass', outline: 'compass-outline', label: 'Explore' },
  JournalTab: { focused: 'calendar', outline: 'calendar-outline', label: 'Journal' },
  TodosTab: { focused: 'checkbox', outline: 'checkbox-outline', label: 'Todos' },
  SettingsTab: { focused: 'settings', outline: 'settings-outline', label: 'Settings' },
};

function TabletRail({ state, navigation }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaView edges={['top', 'bottom']} style={railStyles.container}>
      <View
        style={[
          railStyles.rail,
          {
            backgroundColor: isDark ? '#1c1c1e' : '#f8f8f8',
            borderRightColor: colors.border,
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
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={config.label}
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
                size={24}
                color={isFocused ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  railStyles.label,
                  { color: isFocused ? colors.primary : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {config.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const railStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  rail: {
    width: 80,
    flex: 1,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tab: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginHorizontal: 6,
    marginVertical: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
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
        name="JournalTab"
        component={JournalScreen}
        options={{ title: 'Journal' }}
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

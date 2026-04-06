import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinkingOptions } from '@react-navigation/native';

import TabNavigator from './TabNavigator';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import { RootStackParamList } from './types';
import { useTheme } from '../contexts/ThemeContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['gitnotes://', 'https://gitnotes.app'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          HomeTab: 'home',
          NotesTab: 'notes',
          SettingsTab: 'settings',
        },
      },
      NoteEditor: 'note/:noteId',
    },
  },
};

export default function AppNavigator() {
  const { theme } = useTheme();
  
  const navigationTheme = theme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer linking={linking} theme={navigationTheme}>
        <Stack.Navigator initialRouteName="MainTabs">
          <Stack.Screen 
            name="MainTabs" 
            component={TabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="NoteEditor" 
            component={NoteEditorScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
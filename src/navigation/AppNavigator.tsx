import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinkingOptions } from '@react-navigation/native';

import TabNavigator from './TabNavigator';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import CanvasEditorScreen from '../screens/CanvasEditorScreen';
import CanvasListScreen from '../screens/CanvasListScreen';
import PdfViewerScreen from '../screens/PdfViewerScreen';
import FileViewerScreen from '../screens/FileViewerScreen';
import ImageViewerScreen from '../screens/ImageViewerScreen';
import VideoViewerScreen from '../screens/VideoViewerScreen';
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
          ExploreTab: 'explore',
          SettingsTab: 'settings',
        },
      },
      NoteEditor: 'note/:noteId',
      CanvasEditor: 'canvas/:canvasId',
      CanvasList: 'canvases',
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
          <Stack.Screen 
            name="CanvasEditor" 
            component={CanvasEditorScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CanvasList"
            component={CanvasListScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PdfViewer"
            component={PdfViewerScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="FileViewer"
            component={FileViewerScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ImageViewer"
            component={ImageViewerScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="VideoViewer"
            component={VideoViewerScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
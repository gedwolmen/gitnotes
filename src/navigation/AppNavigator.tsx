import 'react-native-gesture-handler';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinkingOptions } from '@react-navigation/native';

import TabNavigator from './TabNavigator';
import ChatScreen from '../screens/ChatScreen';
import ChatThreadListScreen from '../screens/ChatThreadListScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import CanvasEditorScreen from '../screens/CanvasEditorScreen';
import CanvasListScreen from '../screens/CanvasListScreen';
import PdfViewerScreen from '../screens/PdfViewerScreen';
import FileViewerScreen from '../screens/FileViewerScreen';
import ImageViewerScreen from '../screens/ImageViewerScreen';
import VideoViewerScreen from '../screens/VideoViewerScreen';
import NeumorphicGallery from '../screens/__dev__/NeumorphicGallery';
import { FloatingAIButton } from '../components/ai/FloatingAIButton';
import { ChatRepoPickerModal } from '../components/ai/ChatRepoPickerModal';
import { RootStackParamList } from './types';
import { useTheme } from '../contexts/ThemeContext';
import { useAIStore } from '../stores/aiStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  // Only the custom-scheme prefix is accepted until the gitnotes.app domain
  // hosts an apple-app-site-association / .well-known/assetlinks.json with
  // matching associatedDomains entitlement (iOS) + android:autoVerify intent
  // filter (Android). Without that, another app on the same OS can register
  // the same https:// pattern and hijack the link — see #266.
  prefixes: ['gitnotes://'],
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
      ChatThreadList: 'chat',
      ChatScreen: 'chat/:threadId',
      NeumorphicGallery: '__dev__/neumorphic',
    },
  },
};

export default function AppNavigator() {
  const { isDark } = useTheme();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const chatRepoOwner = useAIStore((state) => state.chatRepoOwner);
  const chatRepoName = useAIStore((state) => state.chatRepoName);
  const [showChatRepoPicker, setShowChatRepoPicker] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState<string | undefined>(undefined);

  const navigationTheme = isDark ? DarkTheme : DefaultTheme;
  const hasChatRepo = Boolean(chatRepoOwner && chatRepoName);

  const handleStateChange = useCallback(() => {
    const routeName = navigationRef.getCurrentRoute()?.name;
    setCurrentRouteName(routeName);

    if (routeName === 'ChatThreadList' && !hasChatRepo) {
      setShowChatRepoPicker(true);
    }
  }, [hasChatRepo, navigationRef]);

  const handleCloseChatRepoPicker = useCallback(() => {
    setShowChatRepoPicker(false);

    if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name === 'ChatThreadList' && !hasChatRepo && navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  }, [hasChatRepo, navigationRef]);

  const handleChatRepoSelected = useCallback(() => {
    setShowChatRepoPicker(false);
  }, []);

  const handleGoToSettings = useCallback(() => {
    setShowChatRepoPicker(false);

    if (navigationRef.isReady()) {
      (navigationRef.navigate as any)('MainTabs', { screen: 'SettingsTab' });
    }
  }, [navigationRef]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer
        linking={linking}
        theme={navigationTheme}
        ref={navigationRef}
        onReady={handleStateChange}
        onStateChange={handleStateChange}
      >
        <View style={{ flex: 1 }}>
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
            <Stack.Screen
              name="ChatThreadList"
              component={ChatThreadListScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ChatScreen"
              component={ChatScreen}
              options={{ headerShown: false }}
            />
            {__DEV__ && (
              <Stack.Screen
                name="NeumorphicGallery"
                component={NeumorphicGallery}
                options={{ headerShown: true, title: 'Neumorphic Gallery' }}
              />
            )}
          </Stack.Navigator>
          <FloatingAIButton currentRouteName={currentRouteName} />
        </View>
      </NavigationContainer>
        <ChatRepoPickerModal
          visible={showChatRepoPicker}
          onClose={handleCloseChatRepoPicker}
          onSelected={handleChatRepoSelected}
          onGoToSettings={handleGoToSettings}
        />
    </GestureHandlerRootView>
  );
}

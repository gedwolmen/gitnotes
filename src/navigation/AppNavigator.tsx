import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinkingOptions } from '@react-navigation/native';

import TabNavigator from './TabNavigator';
import ChatScreen from '../screens/ChatScreen';
import GraphViewScreen from '../screens/GraphViewScreen';
import ChatThreadListScreen from '../screens/ChatThreadListScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import CanvasEditorScreen from '../screens/CanvasEditorScreen';
import PdfViewerScreen from '../screens/PdfViewerScreen';
import FileViewerScreen from '../screens/FileViewerScreen';
import ImageViewerScreen from '../screens/ImageViewerScreen';
import VideoViewerScreen from '../screens/VideoViewerScreen';
import RenderStyleSettingsScreen from '../screens/RenderStyleSettingsScreen';
import RenderStyleEditorScreen from '../screens/RenderStyleEditorScreen';
import TemplateManagerScreen from '../screens/TemplateManagerScreen';
import SyncStatusScreen from '../screens/SyncStatusScreen';
import StageScreen from '../screens/StageScreen';
import ConflictResolverScreen from '../screens/ConflictResolverScreen';
import { FloatingAIButton } from '../components/ai/FloatingAIButton';
import { FloatingStageButton } from '../components/git/FloatingStageButton';
import { ChatRepoPickerModal } from '../components/ai/ChatRepoPickerModal';
import { AddReminderScreen } from '../components/settings/AddReminderScreen';
import ThoughtDumpScreen from '../screens/ThoughtDumpScreen';
import PaywallScreen from '../screens/PaywallScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import { RootStackParamList } from './types';
import { useTheme } from '../contexts/ThemeContext';
import { useAIStore } from '../stores/aiStore';
import { useAIHubStore } from '../stores/aiHubStore';
import { selectIsPro, useProStore } from '../stores/proStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

const getLinkingConfig = (): LinkingOptions<RootStackParamList> => {
  const baseConfig: LinkingOptions<RootStackParamList> = {
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
            CanvasList: 'canvases',
          },
        },
        NoteEditor: 'note/:noteId',
        CanvasEditor: 'canvas/:canvasId',
        ChatThreadList: 'chat',
        ChatScreen: 'chat/:threadId',
        ThoughtDump: 'thought-dump',
        Stage: 'stage',
        Conflicts: 'conflicts/:repoPath/:branch',
      },
    },
  };

  if (__DEV__) {
    // NeumorphicGallery is a dev-only screen for testing neumorphic UI components
    // Guard both the deep link and import to prevent production builds from
    // including or registering this dev artifact — see #1073
    (baseConfig.config as NonNullable<typeof baseConfig.config>).screens.NeumorphicGallery = '__dev__/neumorphic';
  }

  return baseConfig;
};

const linking = getLinkingConfig();

interface AppNavigatorProps {
  showOnboarding?: boolean;
  onOnboardingComplete?: () => void;
  onOnboardingSkip?: () => void;
}

export default function AppNavigator({ showOnboarding, onOnboardingComplete, onOnboardingSkip }: AppNavigatorProps) {
  const { isDark, colors } = useTheme();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const chatRepoOwner = useAIStore((state) => state.chatRepoOwner);
  const chatRepoName = useAIStore((state) => state.chatRepoName);
  const showChatRepoPicker = useAIHubStore((state) => state.pickerVisible);
  const openChatRepoPicker = useAIHubStore((state) => state.openChatRepoPicker);
  const closeChatRepoPicker = useAIHubStore((state) => state.closeChatRepoPicker);
  const [currentRouteName, setCurrentRouteName] = useState<string | undefined>(undefined);
  const isPro = useProStore(selectIsPro);
  const interstitialEligible = useProStore((s) => s.interstitialEligible);
  const markInterstitialShown = useProStore((s) => s.markInterstitialShown);

  useEffect(() => {
    if (!interstitialEligible || isPro) return;
    markInterstitialShown();
    if (navigationRef.isReady()) {
      navigationRef.navigate('Paywall');
    }
  }, [interstitialEligible, isPro, markInterstitialShown, navigationRef]);

  useEffect(() => {
    if (showOnboarding) return;
    if (navigationRef.isReady()) {
      navigationRef.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    }
  }, [showOnboarding, navigationRef]);

  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };
  const hasChatRepo = Boolean(chatRepoOwner && chatRepoName);

  const handleStateChange = useCallback(() => {
    const routeName = navigationRef.getCurrentRoute()?.name;
    setCurrentRouteName(routeName);

    if (routeName === 'ChatThreadList' && !hasChatRepo) {
      openChatRepoPicker();
    }
  }, [hasChatRepo, navigationRef, openChatRepoPicker]);

  const handleCloseChatRepoPicker = useCallback(() => {
    closeChatRepoPicker();

    if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name === 'ChatThreadList' && !hasChatRepo && navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  }, [hasChatRepo, navigationRef, closeChatRepoPicker]);

  const handleChatRepoSelected = useCallback(() => {
    closeChatRepoPicker();
  }, [closeChatRepoPicker]);

  const handleGoToSettings = useCallback(() => {
    closeChatRepoPicker();

    if (navigationRef.isReady()) {
      navigationRef.navigate('MainTabs', { screen: 'SettingsTab' });
    }
  }, [navigationRef, closeChatRepoPicker]);

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
          <Stack.Navigator initialRouteName={showOnboarding ? 'Onboarding' : 'MainTabs'}>
            <Stack.Screen
              name="Onboarding"
              options={{ headerShown: false }}
            >
              {() => <OnboardingScreen onComplete={onOnboardingComplete!} onSkip={onOnboardingSkip!} />}
            </Stack.Screen>
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
              name="GraphView"
              component={GraphViewScreen}
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
            <Stack.Screen
              name="RenderStyleSettings"
              component={RenderStyleSettingsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="RenderStyleEditor"
              component={RenderStyleEditorScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="TemplateManager"
              component={TemplateManagerScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="SyncStatus"
              component={SyncStatusScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Stage"
              component={StageScreen}
              options={{ headerShown: false }}
            />
            {/* TODO(todo 11): point Conflicts at the upgraded SyncStatusScreen
                (conflicts management page). It aliases SyncStatusScreen today so
                the gitnotes://conflicts push-failure deep link resolves. */}
            <Stack.Screen
              name="Conflicts"
              component={SyncStatusScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ConflictResolver"
              component={ConflictResolverScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="AddReminder"
              component={AddReminderScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ThoughtDump"
              component={ThoughtDumpScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Paywall"
              component={PaywallScreen}
              options={{ headerShown: false }}
            />
            {__DEV__ && (
              <Stack.Screen
                name="NeumorphicGallery"
                component={require('../screens/__dev__/NeumorphicGallery').default}
                options={{ headerShown: true, title: 'Neumorphic Gallery' }}
              />
            )}
          </Stack.Navigator>
          <FloatingAIButton currentRouteName={currentRouteName} />
          <FloatingStageButton currentRouteName={currentRouteName} />
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

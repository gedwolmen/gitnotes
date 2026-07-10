import './src/polyfills';
import './src/i18n';
import 'react-native-gesture-handler';
import { LogBox, Platform } from 'react-native';
if (!__DEV__ || Platform.OS === 'android') LogBox.ignoreAllLogs();
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import React, { useState, useEffect, useCallback } from 'react';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});
import { View, StyleSheet, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NoteProvider } from './src/contexts/NoteContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { FolderProvider } from './src/contexts/FolderContext';
import { ViewModeProvider } from './src/contexts/ViewModeContext';
import { AccountsProvider } from './src/contexts/AccountsContext';
import { TodoProvider } from './src/contexts/TodoContext';
import { CanvasProvider } from './src/contexts/CanvasContext';
import { RepoProvider } from './src/contexts/RepoContext';
import { BiometricLockProvider } from './src/contexts/BiometricLockContext';
import { BiometricLockScreen } from './src/components/BiometricLockScreen';
import { BacklinksProvider } from './src/contexts/BacklinksContext';
import AppNavigator from './src/navigation/AppNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { OnboardingService } from './src/services/OnboardingService';
import { NotificationService } from './src/services/NotificationService';
import * as Notifications from 'expo-notifications';
import { useScheduledLearningStore } from './src/stores/scheduledLearningStore';
import { ScheduledLearningService } from './src/services/ScheduledLearningService';
import { StartupSyncGate } from './src/components/StartupSyncGate';
import { GitHubActivityIndicator } from './src/components/GitHubActivityIndicator';
import { bootstrapStorage } from './src/services/StorageBootstrap';
import { useRenderStyleStore } from './src/stores/renderStyleStore';
import { startForegroundWatcher } from './src/services/ForegroundSyncService';
import { startScheduledLearningBackgroundTask } from './src/services/ScheduledLearningBackgroundService';
import { loadForegroundSyncConfig } from './src/hooks/useForegroundSyncSettings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const systemColorScheme = useColorScheme();

  const checkOnboarding = useCallback(async () => {
    await bootstrapStorage();
    void useRenderStyleStore.getState().hydrate();
    const completed = await OnboardingService.isOnboardingCompleted();
    setShowOnboarding(!completed);
    await NotificationService.requestPermissions();

    // Set up notification response listener for scheduled learning
    Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data;
      if (data?.scheduledLearningId) {
        const items = useScheduledLearningStore.getState().items;
        const item = items.find((i) => i.id === data.scheduledLearningId);
        if (!item) return;
        if (data?.noteId) {
          // Note was already generated at save time; the notification is a
          // reminder to read it. Reschedule the next reminder at the next
          // scheduled time.
          await ScheduledLearningService.scheduleNotification(item, String(data.noteId));
          return;
        }
        if (item.isEnabled) {
          // Backwards-compat: legacy notifications without noteId still
          // generate on demand.
          await ScheduledLearningService.generateAndCreateNote(item);
          await ScheduledLearningService.scheduleNotification(item);
        }
      }
    });
    // Foreground auto-pull (#563): subscribe AppState/NetInfo/interval after
    // storage is hydrated so the first pull sees the persisted repo list.
    try {
      const cfg = await loadForegroundSyncConfig();
      startForegroundWatcher(cfg);
    } catch (error) {
      console.warn('[App] foreground sync watcher start failed:', error);
    }
    void startScheduledLearningBackgroundTask();
  }, []);

  useEffect(() => {
    checkOnboarding();
  }, [checkOnboarding]);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const handleOnboardingSkip = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  if (showOnboarding === null) {
    const isDark = systemColorScheme === 'dark';
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#000000' : '#ffffff' }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  if (showOnboarding) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StatusBar style="auto" />
        <OnboardingScreen
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      </ThemeProvider>
    </SafeAreaProvider>
  );
  }

  return (
    <QueryClientProvider client={queryClient}>
    <SafeAreaProvider>
      <ThemeProvider>
        <AccountsProvider>
          <RepoProvider>
            <FolderProvider>
              <NoteProvider>
                <BacklinksProvider>
                  <TodoProvider>
                    <CanvasProvider>
                      <ViewModeProvider>
                        <BiometricLockProvider>
                          <StatusBar style="auto" />
                          <StartupSyncGate>
                            <AppNavigator />
                          </StartupSyncGate>
                          <GitHubActivityIndicator />
                          <BiometricLockScreen />
                        </BiometricLockProvider>
                      </ViewModeProvider>
                    </CanvasProvider>
                  </TodoProvider>
                </BacklinksProvider>
              </NoteProvider>
            </FolderProvider>
          </RepoProvider>
        </AccountsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
  },
});

import './global.css';
import './src/i18n';
import 'react-native-gesture-handler';
import { LogBox, Platform, Linking } from 'react-native';
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
import { NativeWindThemeProvider } from './src/theme/nativewind';
import { FolderProvider } from './src/contexts/FolderContext';
import { ViewModeProvider } from './src/contexts/ViewModeContext';
import { AccountsProvider, rebindRevenueCatToActiveAccount } from './src/contexts/AccountsContext';
import { HostAuthProvider } from './src/contexts/HostAuthContext';
import { TodoProvider } from './src/contexts/TodoContext';
import { CanvasProvider } from './src/contexts/CanvasContext';
import { BiometricLockProvider } from './src/contexts/BiometricLockContext';
import { BiometricLockScreen } from './src/components/BiometricLockScreen';
import { BacklinksProvider } from './src/contexts/BacklinksContext';
import AppNavigator from './src/navigation/AppNavigator';
import { OnboardingService } from './src/services/OnboardingService';
import { NotificationService } from './src/services/NotificationService';
import * as Notifications from 'expo-notifications';
import { useReminderStore, type ReminderNavigationFilter } from './src/stores/reminderStore';
import { ReminderService } from './src/services/ReminderService';
import { legacyGitPurgeService } from './src/services/LegacyGitPurgeService';
import { bootstrapStorage } from './src/services/StorageBootstrap';
import { useRenderStyleStore } from './src/stores/renderStyleStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { reconcileThoughtDumps } from './src/services/ai/thoughtDumpIndexing';
import { LastSelectionPreferenceService } from './src/services/LastSelectionPreferenceService';
import { useProStore } from './src/stores/proStore';
import { enforceTierLimits } from './src/services/TierLimits';
import * as PushNotificationService from './src/services/PushNotificationService';
import { hideDevMenuFloatingActionButton } from './src/utils/devMenuFab';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

if (__DEV__) {
  hideDevMenuFloatingActionButton();
}

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const systemColorScheme = useColorScheme();

  const checkOnboarding = useCallback(async () => {
    await bootstrapStorage();
    // Purge legacy isomorphic-git data at first launch of the git-free husk.
    void legacyGitPurgeService.purgeIfNeeded().catch(() => {});
    void useRenderStyleStore.getState().hydrate();
    // Resolve Pro entitlement before surfacing restored data so the free-tier
    // repo/account caps can be enforced on data brought back by Android backup
    // restore (#1233) — before the stores render it, not after.
    try {
      await useProStore.getState().initialize();
      await enforceTierLimits();
      await rebindRevenueCatToActiveAccount();
    } catch (error) {
      console.warn('[App] tier-limit enforcement failed:', error);
    }
    const completed = await OnboardingService.isOnboardingCompleted();
    setShowOnboarding(!completed);
    await NotificationService.requestPermissions();

    // Set up notification response listener for reminders
    Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data;
      if (data?.kind === 'push-failure') {
        await Linking.openURL(
          PushNotificationService.resolvePushFailureRoute(
            data.conflict === true,
            data.repoPath ? String(data.repoPath) : undefined,
            data.branch ? String(data.branch) : undefined,
          ),
        );
        return;
      }
      if (data?.reminderId) {
        const store = useReminderStore.getState();
        const reminder = store.getItem(String(data.reminderId));
        if (!reminder) return;

        const kind = String(data.kind);
        if (kind === 'note' && data.noteId) {
          await Linking.openURL(`gitnotes://note/${String(data.noteId)}`);
        } else {
          const filter: ReminderNavigationFilter = {
            kind: kind as 'folder' | 'repo' | 'tag',
          };
          if (data.repoPath) filter.repoPath = String(data.repoPath);
          if (data.folderPath) filter.folderPath = String(data.folderPath);
          if (data.tag) filter.tag = String(data.tag);
          store.setPendingFilter(filter);
          await Linking.openURL('gitnotes://notes');
        }

        if (reminder.isEnabled) {
          await ReminderService.scheduleNotification(reminder);
        }
      }
    });

    void reconcileThoughtDumps().catch(() => {});
    void LastSelectionPreferenceService.migrateFromLegacy();
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

  return (
    <QueryClientProvider client={queryClient}>
    <SafeAreaProvider>
      <ThemeProvider>
        <NativeWindThemeProvider>
        <AccountsProvider>
          <HostAuthProvider>
            <FolderProvider>
              <NoteProvider>
                <BacklinksProvider>
                  <TodoProvider>
                    <CanvasProvider>
                      <ViewModeProvider>
                        <BiometricLockProvider>
                          <StatusBar style="auto" />
                          <AppNavigator
                            showOnboarding={showOnboarding}
                            onOnboardingComplete={handleOnboardingComplete}
                            onOnboardingSkip={handleOnboardingSkip}
                          />
                          <BiometricLockScreen />
                        </BiometricLockProvider>
                      </ViewModeProvider>
                    </CanvasProvider>
                  </TodoProvider>
                </BacklinksProvider>
              </NoteProvider>
            </FolderProvider>
          </HostAuthProvider>
        </AccountsProvider>
        </NativeWindThemeProvider>
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

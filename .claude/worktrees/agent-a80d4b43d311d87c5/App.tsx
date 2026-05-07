import 'react-native-gesture-handler';
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
import { AuthProvider } from './src/contexts/AuthContext';
import { TodoProvider } from './src/contexts/TodoContext';
import { CanvasProvider } from './src/contexts/CanvasContext';
import { RepoProvider } from './src/contexts/RepoContext';
import AppNavigator from './src/navigation/AppNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { OnboardingService } from './src/services/OnboardingService';
import { NotificationService } from './src/services/NotificationService';
import { StartupSyncGate } from './src/components/StartupSyncGate';
import { GitHubActivityIndicator } from './src/components/GitHubActivityIndicator';
import { bootstrapStorage } from './src/services/StorageBootstrap';
import { useRenderStyleStore } from './src/stores/renderStyleStore';
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
        <AuthProvider>
          <RepoProvider>
            <FolderProvider>
              <NoteProvider>
                <TodoProvider>
                  <CanvasProvider>
                    <ViewModeProvider>
                      <StatusBar style="auto" />
                      <StartupSyncGate>
                        <AppNavigator />
                      </StartupSyncGate>
                      <GitHubActivityIndicator />
                    </ViewModeProvider>
                  </CanvasProvider>
                </TodoProvider>
              </NoteProvider>
            </FolderProvider>
          </RepoProvider>
        </AuthProvider>
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

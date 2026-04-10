import 'react-native-gesture-handler';
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
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

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  const checkOnboarding = useCallback(async () => {
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
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="dark" />
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
                    </ViewModeProvider>
                  </CanvasProvider>
                </TodoProvider>
              </NoteProvider>
            </FolderProvider>
          </RepoProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});

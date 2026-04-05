import 'react-native-gesture-handler';
import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';

import { NoteProvider } from './src/contexts/NoteContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { FolderProvider } from './src/contexts/FolderContext';
import { ViewModeProvider } from './src/contexts/ViewModeContext';
import AppNavigator from './src/navigation/AppNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { OnboardingService } from './src/services/OnboardingService';

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  const checkOnboarding = useCallback(async () => {
    const completed = await OnboardingService.isOnboardingCompleted();
    setShowOnboarding(!completed);
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
    return null;
  }

  if (showOnboarding) {
    return (
      <ThemeProvider>
        <StatusBar style="auto" />
        <OnboardingScreen
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <FolderProvider>
        <NoteProvider>
          <ViewModeProvider>
            <StatusBar style="auto" />
            <AppNavigator />
          </ViewModeProvider>
        </NoteProvider>
      </FolderProvider>
    </ThemeProvider>
  );
}
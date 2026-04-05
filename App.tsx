import 'react-native-gesture-handler';
import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { NoteProvider } from './src/contexts/NoteContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { FolderProvider } from './src/contexts/FolderContext';
import { ViewModeProvider } from './src/contexts/ViewModeContext';
import { AuthProvider } from './src/contexts/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { OnboardingService } from './src/services/OnboardingService';
import { AuthService } from './src/services/AuthService';

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  const checkOnboarding = useCallback(async () => {
    const completed = await OnboardingService.isOnboardingCompleted();
    setShowOnboarding(!completed);
  }, []);

  const handleUrl = useCallback(async (url: string) => {
    if (url && url.includes('oauth/github')) {
      const codeMatch = url.match(/code=([^&]+)/);
      if (codeMatch && codeMatch[1]) {
        const code = codeMatch[1];
        const token = await AuthService.exchangeCodeForToken(code);
        if (token) {
          await AuthService.storeToken(token);
        }
      }
    }
  }, []);

  useEffect(() => {
    checkOnboarding();
    
    const getInitialURL = async () => {
      const initialURL = await Linking.getInitialURL();
      if (initialURL) {
        handleUrl(initialURL);
      }
    };
    
    getInitialURL();
    
    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });
    
    WebBrowser.maybeCompleteAuthSession();

    return () => {
      subscription.remove();
    };
  }, [checkOnboarding, handleUrl]);

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
      <AuthProvider>
        <FolderProvider>
          <NoteProvider>
            <ViewModeProvider>
              <StatusBar style="auto" />
              <AppNavigator />
            </ViewModeProvider>
          </NoteProvider>
        </FolderProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
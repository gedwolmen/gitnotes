import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';

import { NoteProvider } from './src/contexts/NoteContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { GitHubAuthProvider } from './src/contexts/GitHubAuthContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <ThemeProvider>
      <NoteProvider>
        <GitHubAuthProvider>
          <StatusBar style="auto" />
          <AppNavigator />
        </GitHubAuthProvider>
      </NoteProvider>
    </ThemeProvider>
  );
}

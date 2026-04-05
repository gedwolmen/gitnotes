import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';

import { NoteProvider } from './src/contexts/NoteContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { FolderProvider } from './src/contexts/FolderContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <ThemeProvider>
      <FolderProvider>
        <NoteProvider>
          <StatusBar style="auto" />
          <AppNavigator />
        </NoteProvider>
      </FolderProvider>
    </ThemeProvider>
  );
}

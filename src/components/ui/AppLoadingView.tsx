import React from 'react';
import { View, StyleSheet, ActivityIndicator, type ColorSchemeName } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export interface AppLoadingViewProps {
  colorScheme?: ColorSchemeName;
}

export function AppLoadingView({ colorScheme = 'light' }: AppLoadingViewProps) {
  const isDark = colorScheme === 'dark';
  return (
    <View
      style={[styles.loadingContainer, { backgroundColor: isDark ? '#0E0E0E' : '#ffffff' }]}
      accessibilityLabel="Loading GitNotes"
      accessibilityRole="progressbar"
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ActivityIndicator size="large" color={isDark ? '#ffffff' : '#007AFF'} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
  },
});

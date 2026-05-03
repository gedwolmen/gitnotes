import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext';
import { Surface } from '../src/components/ui/Surface';
import SettingsScreen from '../src/screens/SettingsScreen';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from '../src/contexts/AuthContext';
import { NoteProvider } from '../src/contexts/NoteContext';
import { RepoProvider } from '../src/contexts/RepoContext';
import { CanvasProvider } from '../src/contexts/CanvasContext';
import { TodoProvider } from '../src/contexts/TodoContext';
import { View, Text } from 'react-native';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
  addEventListener: jest.fn(),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
}));

// Mock expo-blur
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return {
    BlurView: (props: any) => <View {...props} testID="blur-view" />
  };
});

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0' },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
}));

// Mock hooks
jest.mock('../src/hooks/useResponsive', () => ({
  useResponsive: () => ({
    isTablet: false,
    maxContentWidth: 600,
  }),
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <RepoProvider>
          <NoteProvider>
            <CanvasProvider>
              <TodoProvider>
                <NavigationContainer>
                  {component}
                </NavigationContainer>
              </TodoProvider>
            </CanvasProvider>
          </NoteProvider>
        </RepoProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

const TestConsumer = () => {
  const { glossy, setGlossy, style, setStyle } = useTheme();
  return (
    <View>
      <Text testID="glossy-val">{String(glossy)}</Text>
      <Text testID="style-val">{style}</Text>
    </View>
  );
};

describe('Glossy UI mode', () => {
  it('coexists with Updated UI and is gated off when style is flat', async () => {
    const { getByTestId, queryByTestId } = renderWithProviders(
      <>
        <TestConsumer />
        <SettingsScreen />
      </>
    );

    // Default: style=neumorphic, glossy=false
    await waitFor(() => {
      expect(getByTestId('glossy-val').props.children).toBe('false');
      expect(getByTestId('style-val').props.children).toBe('neumorphic');
    });

    // Toggle Glossy ON — style stays neumorphic, glossy is effective
    fireEvent(getByTestId('glossy-toggle'), 'valueChange', true);
    await waitFor(() => {
      expect(getByTestId('glossy-val').props.children).toBe('true');
      expect(getByTestId('style-val').props.children).toBe('neumorphic');
    });

    // Switch to Flat — glossy toggle disappears; effective glossy becomes false
    fireEvent(getByTestId('neu-toggle'), 'valueChange', false);
    await waitFor(() => {
      expect(getByTestId('style-val').props.children).toBe('flat');
      expect(getByTestId('glossy-val').props.children).toBe('false');
      expect(queryByTestId('glossy-toggle')).toBeNull();
    });

    // Switch back to Updated UI — glossy preference returns to effective true
    fireEvent(getByTestId('neu-toggle'), 'valueChange', true);
    await waitFor(() => {
      expect(getByTestId('style-val').props.children).toBe('neumorphic');
      expect(getByTestId('glossy-val').props.children).toBe('true');
    });
  });

  it('renders BlurView when glossy is ON and style is neumorphic', async () => {
    const { getByTestId, queryByTestId, getAllByTestId } = render(
      <ThemeProvider>
        <TestSurface />
      </ThemeProvider>
    );

    // Initial glossy false
    expect(queryByTestId('blur-view')).toBeNull();

    fireEvent.press(getByTestId('toggle-btn'));

    await waitFor(() => {
      expect(getAllByTestId('blur-view').length).toBeGreaterThan(0);
    });
  });
});

const TestSurface = () => {
  const { setGlossy, glossy } = useTheme();
  return (
    <View>
      <Surface testID="test-surface" />
      {glossy && <Surface testID="test-surface-2" />}
      <Text testID="toggle-btn" onPress={() => setGlossy(true)}>Toggle</Text>
    </View>
  );
};

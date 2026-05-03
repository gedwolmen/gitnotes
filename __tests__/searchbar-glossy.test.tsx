import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext';
import SearchBar from '../src/components/SearchBar';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-blur — render a View tagged so tests can detect it
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return {
    BlurView: (props: any) => <View {...props} testID="blur-view" />,
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const GlossyController = ({ initialGlossy }: { initialGlossy: boolean }) => {
  const { setGlossy } = useTheme();
  React.useEffect(() => {
    setGlossy(initialGlossy);
  }, [initialGlossy, setGlossy]);
  return null;
};

const renderWithTheme = (component: React.ReactElement, glossy: boolean) =>
  render(
    <ThemeProvider>
      <GlossyController initialGlossy={glossy} />
      {component}
    </ThemeProvider>
  );

describe('SearchBar glossy mode', () => {
  it('does not render BlurView when glossy is OFF', async () => {
    const { queryByTestId } = renderWithTheme(
      <SearchBar value="" onChangeText={() => {}} />,
      false
    );

    // Wait one tick for ThemeProvider initialization to complete
    await waitFor(() => {
      expect(queryByTestId('blur-view')).toBeNull();
    });
  });

  it('renders BlurView when glossy is ON', async () => {
    const { getAllByTestId } = renderWithTheme(
      <SearchBar value="" onChangeText={() => {}} />,
      true
    );

    await waitFor(() => {
      expect(getAllByTestId('blur-view').length).toBeGreaterThan(0);
    });
  });

});

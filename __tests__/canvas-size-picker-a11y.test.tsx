import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const stableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
  accent: '#8b5cf6',
};

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: (cb: any) => {
    const React = require('react');
    React.useEffect(() => {
      const cleanup = cb();
      return cleanup;
    }, []);
  },
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: stableColors, isDark: false }),
}));

jest.mock('../src/contexts/CanvasContext', () => ({
  useCanvases: () => ({
    canvases: [],
    filteredCanvases: [],
    searchQuery: '',
    setSearchQuery: jest.fn(),
    deleteCanvas: jest.fn(),
    refreshCanvases: jest.fn(),
  }),
}));

jest.mock('../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: [] }),
}));

jest.mock('../src/hooks/useEntityFilter', () => ({
  useEntityFilter: () => ({
    applyFilters: (xs: any) => xs,
    activeCount: 0,
    filters: {},
    setFilter: jest.fn(),
    clearFilters: jest.fn(),
  }),
}));

jest.mock('../src/components/SearchBar', () => {
  const { View } = require('react-native');
  return () => <View />;
});

jest.mock('../src/components/EntityFilterModal', () => {
  const { View } = require('react-native');
  return { EntityFilterModal: () => <View /> };
});

jest.mock('../src/components/ActiveFilterStrip', () => {
  const { View } = require('react-native');
  return { ActiveFilterStrip: () => <View /> };
});

jest.mock('../src/components/ui', () => {
  const { View, Text, Pressable } = require('react-native');
  return {
    ScreenHeader: ({ title, actions }: any) => (
      <View>
        <Text>{title}</Text>
        {actions}
      </View>
    ),
    IconButton: ({ children, onPress, testID, accessibilityLabel }: any) => (
      <Pressable testID={testID} accessibilityLabel={accessibilityLabel} onPress={onPress}>
        {children}
      </Pressable>
    ),
    useScreenHeaderHeight: () => 60,
    useTabBarHeight: () => 50,
  };
});

import CanvasListScreen from '../src/screens/CanvasListScreen';

describe('canvas size picker a11y (issue #649)', () => {
  test('overlay TouchableOpacity exposes accessible={false} so child rows surface in a11y tree', () => {
    const { getByTestId } = render(<CanvasListScreen />);
    fireEvent.press(getByTestId('canvas-list.icon-button.new-canvas'));

    const overlay = getByTestId('canvas-list.overlay.size-picker');
    expect(overlay.props.accessible).toBe(false);
  });

  test('every preset row remains individually queryable by testID', () => {
    const { getByTestId } = render(<CanvasListScreen />);
    fireEvent.press(getByTestId('canvas-list.icon-button.new-canvas'));

    expect(getByTestId('canvas-list.button.pick-size-phone')).toBeTruthy();
    expect(getByTestId('canvas-list.button.pick-size-tablet')).toBeTruthy();
    expect(getByTestId('canvas-list.button.pick-size-landscape')).toBeTruthy();
    expect(getByTestId('canvas-list.button.pick-size-square')).toBeTruthy();
    expect(getByTestId('canvas-list.button.pick-size-a4')).toBeTruthy();
  });
});

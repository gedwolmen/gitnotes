import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import { renderWithTheme } from './helpers/renderWithTheme';
import NoteImage from '../src/components/NoteImage';

jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => createElement(Text, null, name) };
});

jest.mock('expo-image', () => ({
  Image: () => {
    const { View } = require('react-native');
    return <View testID="expo-image" />;
  },
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => {
    const { createElement, Fragment } = require('react');
    return createElement(Fragment, null, children);
  },
  GestureDetector: ({ children }: { children: React.ReactNode }) => {
    const { createElement, Fragment } = require('react');
    return createElement(Fragment, null, children);
  },
}));

jest.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: (component: unknown) => component },
  useSharedValue: () => ({ value: 0 }),
  useAnimatedStyle: () => ({}),
  withTiming: (value: unknown) => value,
  withSpring: (value: unknown) => value,
  runOnJS: (fn: unknown) => fn,
}));

const mockSvgImage = jest.fn(({ uri }: { uri: string }) => {
  const { createElement } = require('react');
  const { View, Text } = require('react-native');
  return createElement(View, { testID: 'svg-image' }, createElement(Text, null, uri));
});

jest.mock('../src/components/SvgImage', () => ({
  __esModule: true,
  default: ({ uri }: { uri: string }) => mockSvgImage({ uri }),
}));

jest.mock('../src/components/ImageZoomRotate', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => {
    const { createElement } = require('react');
    const { View } = require('react-native');
    return createElement(View, { testID: 'image-zoom-rotate' }, children);
  },
}));

describe('NoteImage upgrade', () => {
  beforeEach(() => {
    mockSvgImage.mockClear();
  });

  it('renders expo-image for non-SVG URI', () => {
    const { getByTestId } = renderWithTheme(
      <NoteImage uri="https://example.com/photo.jpg" alt="Photo" />,
    );

    expect(getByTestId('expo-image')).toBeTruthy();
  });

  it('renders SvgImage for SVG URI', () => {
    const { getByTestId, getByText } = renderWithTheme(
      <NoteImage uri="https://example.com/icon.svg" alt="Icon" />,
    );

    expect(getByTestId('svg-image')).toBeTruthy();
    expect(getByText('https://example.com/icon.svg')).toBeTruthy();
  });

  it('renders caption when alt text provided', () => {
    const { getByText } = renderWithTheme(
      <NoteImage uri="https://example.com/photo.jpg" alt="Test caption" />,
    );

    expect(getByText('Test caption')).toBeTruthy();
  });

  it('shows fullscreen with zoom on press', () => {
    const { getByTestId, getByText } = renderWithTheme(
      <NoteImage uri="https://example.com/photo.jpg" alt="Photo" />,
    );

    fireEvent.press(getByTestId('expo-image'));

    expect(getByTestId('image-zoom-rotate')).toBeTruthy();
    expect(getByText('close')).toBeTruthy();
  });
});

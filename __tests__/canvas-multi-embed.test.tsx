import React from 'react';
import { Text, View } from 'react-native';
import { render } from '@testing-library/react-native';

import { NotePreviewRenderer } from '../src/utils/markdownRenderer';

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

jest.mock('react-native-marked', () => {
  class Renderer {
    private key = 0;

    getKey() {
      this.key += 1;
      return `renderer-key-${this.key}`;
    }
  }

  return { Renderer };
});

const createRenderer = (CanvasPreview: React.ComponentType<{ canvasId: string }>) => new NotePreviewRenderer({
  colors: {
    primary: '#2563eb',
    text: '#111827',
    surfaceSecondary: '#e5e7eb',
  },
  CanvasPreview,
});

describe('canvas multi-embed regression', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders two canvas embeds without crashing', () => {
    const renderer = createRenderer(({ canvasId }) => <Text testID={`canvas-${canvasId}`}>{canvasId}</Text>);

    const screen = render(
      <View>
        {renderer.link([], 'canvas:canvas-1')}
        {renderer.link([], 'canvas:canvas-2')}
      </View>,
    );

    expect(screen.getByTestId('canvas-canvas-1')).toBeTruthy();
    expect(screen.getByTestId('canvas-canvas-2')).toBeTruthy();
  });

  it('assigns stable unique keys to each canvas preview', () => {
    const renderer = createRenderer(({ canvasId }) => <Text>{canvasId}</Text>);

    const firstNode = renderer.link([], 'canvas:canvas-1') as React.ReactElement<{ children: React.ReactNode }>;
    const secondNode = renderer.link([], 'canvas:canvas-2') as React.ReactElement<{ children: React.ReactNode }>;
    const firstPreview = React.Children.only(firstNode.props.children) as React.ReactElement;
    const secondPreview = React.Children.only(secondNode.props.children) as React.ReactElement;

    expect(firstNode.key).toBe('canvas-boundary-canvas-1');
    expect(secondNode.key).toBe('canvas-boundary-canvas-2');
    expect(firstPreview.key).toBe('canvas-1');
    expect(secondPreview.key).toBe('canvas-2');
  });

  it('shows a placeholder when canvas preview rendering throws', () => {
    const renderer = createRenderer(({ canvasId }) => {
      if (canvasId === 'canvas-2') {
        throw new Error('Skia init failed');
      }

      return <Text testID={`canvas-${canvasId}`}>{canvasId}</Text>;
    });

    const screen = render(
      <View>
        {renderer.link([], 'canvas:canvas-1')}
        {renderer.link([], 'canvas:canvas-2')}
      </View>,
    );

    expect(screen.getByTestId('canvas-canvas-1')).toBeTruthy();
    expect(screen.getByText('Canvas preview unavailable')).toBeTruthy();
  });
});

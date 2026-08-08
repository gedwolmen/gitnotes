import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import type { CanvasElement } from '../src/models/Canvas';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({}), useRoute: () => ({ params: {} }) }));
jest.mock('@react-navigation/native-stack', () => ({}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: () => null,
  Gesture: {
    Pan: () => ({
      maxPointers: () => ({
        onStart: () => ({
          onChange: () => ({
            onEnd: () => ({}),
          }),
        }),
      }),
      minPointers: () => ({
        averageTouches: () => ({
          onStart: () => ({
            onUpdate: () => ({}),
          }),
        }),
      }),
    }),
    Pinch: () => ({
      onStart: () => ({
        onUpdate: () => ({}),
      }),
    }),
    Simultaneous: () => ({}),
  },
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {},
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedStyle: () => ({}),
  useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
  useSharedValue: (value: unknown) => ({ value }),
  withSpring: (value: unknown) => value,
}));
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: () => null,
  Path: () => null,
  Rect: () => null,
  Oval: () => null,
  RoundedRect: () => null,
  Fill: () => null,
  Group: () => null,
  Skia: { Path: { Make: () => ({ moveTo: () => {}, lineTo: () => {}, close: () => {}, rewind: () => {}, setIsVolatile: () => ({}) }) } },
  matchFont: () => ({}),
  Text: () => null,
}));
jest.mock('../src/contexts/CanvasContext', () => ({ useCanvases: () => ({ getCanvasById: () => undefined, createCanvas: async () => undefined, updateCanvas: async () => undefined }) }));
jest.mock('../src/contexts/ThemeContext', () => ({ useTheme: () => ({ colors: { background: '#fff', border: '#ddd', surface: '#fff', text: '#111', textSecondary: '#666', primary: '#2563eb' } }) }));
jest.mock('../src/components/GitContextPicker', () => () => null);
jest.mock('../src/services/CanvasGitHubSyncService', () => ({ syncCanvasToGitHub: async () => ({ success: true }) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: async () => ({ canceled: true, assets: null }) }));

import {
  clampCanvasTranslation,
  getCanvasContentBounds,
  getCanvasFitTranslation,
  moveCanvasElement,
} from '../src/screens/CanvasEditorScreen';

describe('canvas pan clamp helpers', () => {
  const elements: CanvasElement[] = [
    { type: 'stroke', id: 'stroke-1', tool: 'pen', color: '#000', width: 8, points: [{ x: 20, y: 40 }, { x: 60, y: 10 }] },
    { type: 'shape', id: 'shape-1', shape: 'rect', color: '#111', width: 4, x1: -30, y1: 80, x2: 0, y2: 100 },
    { type: 'chart', id: 'chart-1', chartType: 'bar', title: 'Sales', labels: ['A'], values: [1], x: 200, y: 300, width: 50, height: 60 },
    { type: 'image', id: 'image-1', data: 'jpeg-data', mimeType: 'image/jpeg', x: 260, y: -20, width: 60, height: 50 },
  ];

  it('includes image extents in a bounding box across mixed canvas elements', () => {
    // Given: mixed elements whose image extends beyond every other element on two axes.
    // When: content bounds are computed.
    const bounds = getCanvasContentBounds(elements);

    // Then: the image contributes its full width and height.
    expect(bounds).toEqual({ minX: -32, minY: -20, maxX: 320, maxY: 360 });
  });

  it('computes exact content bounds for an image-only canvas', () => {
    // Given: a single image with positive dimensions.
    const imageElements: CanvasElement[] = [
      { type: 'image', id: 'image-only', data: 'jpeg-data', mimeType: 'image/jpeg', x: 12, y: 34, width: 56, height: 78 },
    ];

    // When: content bounds are computed.
    const bounds = getCanvasContentBounds(imageElements);

    // Then: the bounds match the image rectangle exactly.
    expect(bounds).toEqual({ minX: 12, minY: 34, maxX: 68, maxY: 112 });
  });

  it('translates an image without changing its dimensions or data', () => {
    // Given: an image element at a known position.
    const image: CanvasElement = {
      type: 'image',
      id: 'image-move',
      data: 'jpeg-data',
      mimeType: 'image/jpeg',
      x: 10,
      y: 20,
      width: 100,
      height: 80,
    };

    // When: the element is moved by a deterministic delta.
    const moved = moveCanvasElement(image, -4, 7);

    // Then: only the image position changes.
    expect(moved).toEqual({ ...image, x: 6, y: 27 });
  });

  it('centers non-empty content in the viewport for auto-fit/reset', () => {
    expect(getCanvasFitTranslation({ minX: -32, minY: 6, maxX: 250, maxY: 360 }, 400, 400, 1)).toEqual({ translateX: 91, translateY: 17 });
  });

  it('clamps pan translation so at least 80px stays visible', () => {
    const bounds = { minX: -32, minY: 6, maxX: 250, maxY: 360 };

    expect(clampCanvasTranslation(-500, -500, 1, bounds, 400, 400)).toEqual({ translateX: -170, translateY: -280 });
    expect(clampCanvasTranslation(-500, -900, 2, bounds, 400, 400)).toEqual({ translateX: -420, translateY: -640 });
  });
});

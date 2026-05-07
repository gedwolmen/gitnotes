import React from 'react';
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

import { clampCanvasTranslation, getCanvasContentBounds, getCanvasFitTranslation } from '../src/screens/CanvasEditorScreen';

describe('canvas pan clamp helpers', () => {
  const elements: CanvasElement[] = [
    { type: 'stroke', id: 'stroke-1', tool: 'pen', color: '#000', width: 8, points: [{ x: 20, y: 40 }, { x: 60, y: 10 }] },
    { type: 'shape', id: 'shape-1', shape: 'rect', color: '#111', width: 4, x1: -30, y1: 80, x2: 0, y2: 100 },
    { type: 'chart', id: 'chart-1', chartType: 'bar', title: 'Sales', labels: ['A'], values: [1], x: 200, y: 300, width: 50, height: 60 },
  ];

  it('computes a bounding box across mixed canvas elements', () => {
    expect(getCanvasContentBounds(elements)).toEqual({ minX: -32, minY: 6, maxX: 250, maxY: 360 });
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

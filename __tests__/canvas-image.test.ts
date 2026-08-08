import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { createCanvas, isImageElement } from '../src/models/Canvas';
import { canvasSceneToSvg } from '../src/utils/canvasExport';
import type { CanvasElement, CanvasImage } from '../src/models/Canvas';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({}), useRoute: () => ({ params: {} }) }));
jest.mock('@react-navigation/native-stack', () => ({}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: () => null,
  Gesture: {
    Pan: () => ({
      maxPointers: () => ({ onStart: () => ({ onChange: () => ({ onEnd: () => ({}) }) }) }),
      minPointers: () => ({ averageTouches: () => ({ onStart: () => ({ onUpdate: () => ({}) }) }) }),
    }),
    Pinch: () => ({ onStart: () => ({ onUpdate: () => ({}) }) }),
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
  Image: () => null,
  Skia: { Path: { Make: () => ({ moveTo: () => {}, lineTo: () => {}, close: () => {}, rewind: () => {}, setIsVolatile: () => ({}) }) } },
  matchFont: () => ({}),
  Text: () => null,
}));
jest.mock('../src/contexts/CanvasContext', () => ({ useCanvases: () => ({ getCanvasById: () => undefined, createCanvas: async () => undefined, updateCanvas: async () => undefined }) }));
jest.mock('../src/contexts/ThemeContext', () => ({ useTheme: () => ({ colors: { background: '#fff', border: '#ddd', surface: '#fff', text: '#111', textSecondary: '#666', primary: '#2563eb' } }) }));
jest.mock('../src/components/GitContextPicker', () => () => null);
jest.mock('../src/services/CanvasGitHubSyncService', () => ({ syncCanvasToGitHub: async () => ({ success: true }) }));

import { getCanvasContentBounds, moveCanvasElement } from '../src/screens/CanvasEditorScreen';

describe('CanvasImage lifecycle', () => {
  const validImage: CanvasImage = {
    type: 'image',
    id: 'img-1',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mimeType: 'image/jpeg',
    x: 10,
    y: 20,
    width: 100,
    height: 80,
  };

  it('createCanvas preserves image elements through round-trip', () => {
    const canvas = createCanvas({
      title: 'Image Test',
      scene: { version: 1, elements: [validImage] },
    });

    expect(canvas.scene.elements).toHaveLength(1);
    expect(canvas.scene.elements[0].type).toBe('image');
    const el = canvas.scene.elements[0] as CanvasImage;
    expect(el.data).toBe(validImage.data);
    expect(el.mimeType).toBe('image/jpeg');
    expect(el.width).toBe(100);
    expect(el.height).toBe(80);
  });

  it('createCanvas preserves mixed elements including images and animations', () => {
    const textWithAnim: CanvasElement = {
      type: 'text',
      id: 'txt-1',
      text: 'Hello',
      x: 50,
      y: 60,
      fontSize: 16,
      color: '#000',
      animation: { type: 'fade', duration: 2000, loop: true },
    };

    const canvas = createCanvas({
      title: 'Mixed',
      scene: { version: 1, elements: [validImage, textWithAnim] },
    });

    expect(canvas.scene.elements).toHaveLength(2);
    expect(isImageElement(canvas.scene.elements[0])).toBe(true);
  });

  it('getCanvasContentBounds includes image extents', () => {
    const elements: CanvasElement[] = [
      { type: 'stroke', id: 's1', tool: 'pen', color: '#000', width: 2, points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] },
      validImage,
    ];

    const bounds = getCanvasContentBounds(elements);
    expect(bounds).not.toBeNull();
    // Image at (10,20) with size (100,80) → maxX=110, maxY=100
    expect(bounds!.maxX).toBe(110);
    expect(bounds!.maxY).toBe(100);
    expect(bounds!.minX).toBe(-1);
    expect(bounds!.minY).toBe(-1);
  });

  it('getCanvasContentBounds works with image-only canvas', () => {
    const bounds = getCanvasContentBounds([validImage]);
    expect(bounds).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 100 });
  });

  it('moveCanvasElement translates image position without changing dimensions', () => {
    const moved = moveCanvasElement(validImage, 5, -3) as CanvasImage;
    expect(moved.x).toBe(15);
    expect(moved.y).toBe(17);
    expect(moved.width).toBe(100);
    expect(moved.height).toBe(80);
    expect(moved.data).toBe(validImage.data);
  });

  it('canvasSceneToSvg includes image elements', () => {
    const svg = canvasSceneToSvg({
      version: 1,
      width: 800,
      height: 600,
      background: '#FFFFFF',
      elements: [validImage],
    });

    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/jpeg;base64,');
    expect(svg).toContain('x="10"');
    expect(svg).toContain('y="20"');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="80"');
  });

  it('canvasSceneToSvg skips images with empty data', () => {
    const emptyImage: CanvasImage = { ...validImage, data: '' };
    const svg = canvasSceneToSvg({
      version: 1,
      width: 800,
      height: 600,
      background: '#FFFFFF',
      elements: [emptyImage],
    });

    expect(svg).not.toContain('<image');
  });
});

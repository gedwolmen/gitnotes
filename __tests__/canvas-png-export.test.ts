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

const mockEncodeToBytes = jest.fn(() => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
const mockMakeImageSnapshot = jest.fn(() => ({ encodeToBytes: mockEncodeToBytes }));
const mockGetCanvas = jest.fn(() => ({
  save: jest.fn(),
  restore: jest.fn(),
  drawColor: jest.fn(),
  scale: jest.fn(),
  translate: jest.fn(),
  drawPath: jest.fn(),
  drawRect: jest.fn(),
  drawOval: jest.fn(),
  drawRRect: jest.fn(),
  drawArc: jest.fn(),
  drawText: jest.fn(),
  drawImage: jest.fn(),
}));
const mockDispose = jest.fn();
const mockMakeOffscreen = jest.fn(() => ({
  getCanvas: mockGetCanvas,
  makeImageSnapshot: mockMakeImageSnapshot,
  dispose: mockDispose,
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
  Skia: {
    Path: { Make: () => ({ moveTo: jest.fn(), lineTo: jest.fn(), close: jest.fn(), rewind: jest.fn(), setIsVolatile: jest.fn() }) },
    Paint: () => ({
      setColor: jest.fn(),
      setStyle: jest.fn(),
      setStrokeWidth: jest.fn(),
      setStrokeCap: jest.fn(),
      setStrokeJoin: jest.fn(),
      setAntiAlias: jest.fn(),
      setAlphaf: jest.fn(),
    }),
    Color: (c: string) => c,
    XYWHRect: (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h }),
    Font: jest.fn(() => ({})),
    Data: { fromBase64: jest.fn(() => ({})) },
    Image: { MakeImageFromEncoded: jest.fn(() => ({})) },
    Surface: { MakeOffscreen: (...args: unknown[]) => mockMakeOffscreen(...args) },
  },
  matchFont: () => ({}),
  Text: () => null,
}));
jest.mock('../src/contexts/CanvasContext', () => ({ useCanvases: () => ({ getCanvasById: () => undefined, createCanvas: async () => undefined, updateCanvas: async () => undefined }) }));
jest.mock('../src/contexts/ThemeContext', () => ({ useTheme: () => ({ colors: { background: '#fff', border: '#ddd', surface: '#fff', text: '#111', textSecondary: '#666', primary: '#2563eb' } }) }));
jest.mock('../src/components/GitContextPicker', () => () => null);
jest.mock('../src/services/CanvasGitHubSyncService', () => ({ syncCanvasToGitHub: async () => ({ success: true }) }));

import { renderSceneToPng } from '../src/utils/canvasPngExport';

describe('renderSceneToPng', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null for empty elements array', async () => {
    const result = await renderSceneToPng([], 800, 600);
    expect(result).toBeNull();
  });

  it('returns Uint8Array with PNG magic bytes for valid elements', async () => {
    const elements: CanvasElement[] = [
      { type: 'text', id: 't1', text: 'Hello', x: 10, y: 20, fontSize: 16, color: '#000' },
    ];

    const result = await renderSceneToPng(elements, 800, 600);

    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result![0]).toBe(0x89);
    expect(result![1]).toBe(0x50);
    expect(result![2]).toBe(0x4E);
    expect(result![3]).toBe(0x47);
  });

  it('creates offscreen surface with correct dimensions', async () => {
    const elements: CanvasElement[] = [
      { type: 'shape', id: 's1', shape: 'rect', color: '#000', width: 2, x1: 0, y1: 0, x2: 100, y2: 50 },
    ];

    await renderSceneToPng(elements, 800, 600);

    expect(mockMakeOffscreen).toHaveBeenCalled();
    const [w, h] = mockMakeOffscreen.mock.calls[0];
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(4096);
    expect(h).toBeLessThanOrEqual(4096);
  });

  it('caps output dimensions at 4096px', async () => {
    const elements: CanvasElement[] = [
      { type: 'shape', id: 's1', shape: 'rect', color: '#000', width: 2, x1: 0, y1: 0, x2: 3000, y2: 3000 },
    ];

    await renderSceneToPng(elements, 4000, 4000);

    const [w, h] = mockMakeOffscreen.mock.calls[0];
    expect(w).toBeLessThanOrEqual(4096);
    expect(h).toBeLessThanOrEqual(4096);
  });

  it('disposes surface after encoding', async () => {
    const elements: CanvasElement[] = [
      { type: 'text', id: 't1', text: 'Test', x: 0, y: 10, fontSize: 14, color: '#000' },
    ];

    await renderSceneToPng(elements, 800, 600);

    expect(mockDispose).toHaveBeenCalled();
  });

  it('disposes surface even when encoding fails', async () => {
    mockMakeImageSnapshot.mockReturnValueOnce(null);

    const elements: CanvasElement[] = [
      { type: 'text', id: 't1', text: 'Test', x: 0, y: 10, fontSize: 14, color: '#000' },
    ];

    const result = await renderSceneToPng(elements, 800, 600);

    expect(result).toBeNull();
    expect(mockDispose).toHaveBeenCalled();
  });

  it('returns null when MakeOffscreen fails', async () => {
    mockMakeOffscreen.mockReturnValueOnce(null);

    const elements: CanvasElement[] = [
      { type: 'text', id: 't1', text: 'Test', x: 0, y: 10, fontSize: 14, color: '#000' },
    ];

    const result = await renderSceneToPng(elements, 800, 600);

    expect(result).toBeNull();
  });

  it('handles mixed element types', async () => {
    const elements: CanvasElement[] = [
      { type: 'stroke', id: 'st1', tool: 'pen', color: '#000', width: 2, points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] },
      { type: 'shape', id: 'sh1', shape: 'rect', color: '#F00', width: 2, x1: 10, y1: 10, x2: 60, y2: 40 },
      { type: 'text', id: 't1', text: 'Hello', x: 20, y: 30, fontSize: 16, color: '#000' },
      { type: 'image', id: 'img1', data: 'dGVzdA==', mimeType: 'image/jpeg', x: 0, y: 0, width: 100, height: 80 },
    ];

    const result = await renderSceneToPng(elements, 800, 600);

    expect(result).not.toBeNull();
    expect(mockGetCanvas).toHaveBeenCalled();
  });
});

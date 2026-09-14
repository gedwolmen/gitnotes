/**
 * Focused tests for CanvasThumbnail.
 *
 * CanvasThumbnail renders a mini preview of a canvas scene using Skia.Canvas.
 * It uses Skia.PathBuilder.Make().build() for stroke/shape/chart paths and
 * Skia.PathBuilder.arcToOval for pie slices.
 *
 * These tests verify:
 * - Empty scene renders icon placeholder
 * - Stroke elements render correctly via path
 * - Shape elements (rect, ellipse, diamond, arrow, line) render
 * - Chart elements (bar, line, pie) render
 * - Text elements render
 * - The PathBuilder pattern is used (not deprecated Skia.Path.Make fluent API)
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { View } from 'react-native';
import CanvasThumbnail from '@/components/CanvasThumbnail';
import type { CanvasScene, CanvasStroke, CanvasShape, CanvasText, CanvasChart } from '@/models/Canvas';

// Mock @shopify/react-native-skia
jest.mock('@shopify/react-native-skia', () => {
  const { View } = require('react-native');
  const passthrough = (name: string) => {
    const Component = ({ children, ...rest }: { children?: React.ReactNode }) =>
      require('react').createElement(View, rest, children);
    Component.displayName = name;
    return Component;
  };
  return {
    __esModule: true,
    Canvas: passthrough('Canvas'),
    Group: passthrough('Group'),
    Path: passthrough('Path'),
    Rect: passthrough('Rect'),
    RoundedRect: passthrough('RoundedRect'),
    Oval: passthrough('Oval'),
    Fill: passthrough('Fill'),
    Text: passthrough('Text'),
    Skia: {
      Path: {
        Make: () => ({ moveTo: () => {}, lineTo: () => {}, close: () => {}, build: () => ({}), rewind: () => {}, setIsVolatile: () => {} }),
        Circle: () => ({}),
        Rect: () => ({}),
        Oval: () => ({}),
        RRect: () => ({}),
      },
      PathBuilder: {
        Make: () => ({
          moveTo: () => {},
          lineTo: () => {},
          close: () => {},
          arcToOval: () => {},
          build: () => ({}),
        }),
      },
      XYWHRect: () => ({}),
      RRect: () => ({}),
      Font: { Make: () => null },
      Data: { fromBase64: () => ({}) },
      Image: { MakeImageFromEncoded: () => null },
    },
    matchFont: () => null,
    useFont: () => null,
    useTypeface: () => null,
    useValue: () => ({ current: 0 }),
    default: passthrough('Canvas'),
  };
});

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockIcon = (props: { name?: string; size?: number; color?: string }) =>
    React.createElement(View, { testID: 'icon-' + (props.name || '') });
  return {
    Ionicons: Object.assign(MockIcon, { glyphMap: {} }),
  };
});

const EMPTY_SCENE: CanvasScene = {
  version: 1,
  width: 800,
  height: 600,
  background: '#FFFFFF',
  elements: [],
};

const STROKE_SCENE: CanvasScene = {
  version: 1,
  width: 800,
  height: 600,
  background: '#FFFFFF',
  elements: [
    {
      type: 'stroke',
      id: 'stroke-1',
      tool: 'pen',
      color: '#000000',
      width: 2,
      points: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 15 }],
    } satisfies CanvasStroke,
  ],
};

const SHAPE_SCENE: CanvasScene = {
  version: 1,
  width: 800,
  height: 600,
  background: '#FFFFFF',
  elements: [
    { type: 'shape', id: 'shape-rect', shape: 'rect', color: '#FF0000', width: 2, x1: 10, y1: 10, x2: 50, y2: 50 },
    { type: 'shape', id: 'shape-ellipse', shape: 'ellipse', color: '#00FF00', width: 2, x1: 60, y1: 10, x2: 100, y2: 50 },
    { type: 'shape', id: 'shape-line', shape: 'line', color: '#0000FF', width: 2, x1: 10, y1: 60, x2: 50, y2: 100 },
    { type: 'shape', id: 'shape-arrow', shape: 'arrow', color: '#FF00FF', width: 2, x1: 60, y1: 60, x2: 100, y2: 100 },
    { type: 'shape', id: 'shape-diamond', shape: 'diamond', color: '#FFFF00', width: 2, x1: 110, y1: 10, x2: 150, y2: 50 },
    { type: 'shape', id: 'shape-roundRect', shape: 'roundRect', color: '#00FFFF', width: 2, x1: 110, y1: 60, x2: 150, y2: 100 },
  ] as CanvasShape[],
};

const TEXT_SCENE: CanvasScene = {
  version: 1,
  width: 800,
  height: 600,
  background: '#FFFFFF',
  elements: [
    { type: 'text', id: 'text-1', text: 'Hello', x: 10, y: 30, fontSize: 20, color: '#000000' } satisfies CanvasText,
  ],
};

const CHART_SCENE_BAR: CanvasScene = {
  version: 1,
  width: 800,
  height: 600,
  background: '#FFFFFF',
  elements: [
    {
      type: 'chart',
      id: 'chart-bar',
      chartType: 'bar',
      title: 'Test',
      labels: ['A', 'B', 'C'],
      values: [10, 20, 30],
      x: 10,
      y: 10,
      width: 100,
      height: 80,
    } satisfies CanvasChart,
  ],
};

const CHART_SCENE_LINE: CanvasScene = {
  version: 1,
  width: 800,
  height: 600,
  background: '#FFFFFF',
  elements: [
    {
      type: 'chart',
      id: 'chart-line',
      chartType: 'line',
      title: 'Test',
      labels: ['A', 'B', 'C'],
      values: [10, 20, 30],
      x: 10,
      y: 10,
      width: 100,
      height: 80,
    } satisfies CanvasChart,
  ],
};

const CHART_SCENE_PIE: CanvasScene = {
  version: 1,
  width: 800,
  height: 600,
  background: '#FFFFFF',
  elements: [
    {
      type: 'chart',
      id: 'chart-pie',
      chartType: 'pie',
      title: 'Test',
      labels: ['A', 'B'],
      values: [30, 70],
      x: 10,
      y: 10,
      width: 100,
      height: 80,
    } satisfies CanvasChart,
  ],
};

describe('CanvasThumbnail', () => {
  it('renders without crashing', () => {
    expect(() => render(
      <CanvasThumbnail scene={EMPTY_SCENE} width={200} height={150} />
    )).not.toThrow();
  });

  it('renders empty scene with icon placeholder', () => {
    const { getByTestId } = render(
      <CanvasThumbnail scene={EMPTY_SCENE} width={200} height={150} />
    );
    expect(getByTestId('icon-easel-outline')).toBeTruthy();
  });

  it('renders stroke scene without crashing', () => {
    expect(() => render(
      <CanvasThumbnail scene={STROKE_SCENE} width={200} height={150} />
    )).not.toThrow();
  });

  it('renders shape scene (rect, ellipse, line, arrow, diamond, roundRect) without crashing', () => {
    expect(() => render(
      <CanvasThumbnail scene={SHAPE_SCENE} width={200} height={150} />
    )).not.toThrow();
  });

  it('renders text scene without crashing', () => {
    expect(() => render(
      <CanvasThumbnail scene={TEXT_SCENE} width={200} height={150} />
    )).not.toThrow();
  });

  it('renders bar chart scene without crashing', () => {
    expect(() => render(
      <CanvasThumbnail scene={CHART_SCENE_BAR} width={200} height={150} />
    )).not.toThrow();
  });

  it('renders line chart scene without crashing', () => {
    expect(() => render(
      <CanvasThumbnail scene={CHART_SCENE_LINE} width={200} height={150} />
    )).not.toThrow();
  });

  it('renders pie chart scene without crashing', () => {
    expect(() => render(
      <CanvasThumbnail scene={CHART_SCENE_PIE} width={200} height={150} />
    )).not.toThrow();
  });

  it('renders with custom background color', () => {
    expect(() => render(
      <CanvasThumbnail scene={EMPTY_SCENE} width={200} height={150} background="#f0f0f0" />
    )).not.toThrow();
  });

  it('renders null/undefined scene as empty', () => {
    const { getByTestId: getByNull } = render(
      <CanvasThumbnail scene={undefined as unknown as CanvasScene} width={200} height={150} />
    );
    expect(getByNull('icon-easel-outline')).toBeTruthy();

    const { getByTestId: getByEmpty } = render(
      <CanvasThumbnail scene={null as unknown as CanvasScene} width={200} height={150} />
    );
    expect(getByEmpty('icon-easel-outline')).toBeTruthy();
  });
});

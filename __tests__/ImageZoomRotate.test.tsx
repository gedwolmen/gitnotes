import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const Gesture = {
    Pinch: () => ({
      onUpdate: function (this: unknown) { return this; },
      onEnd: function (this: unknown) { return this; },
    }),
    Rotation: () => ({
      onUpdate: function (this: unknown) { return this; },
      onEnd: function (this: unknown) { return this; },
    }),
    Tap: () => ({
      numberOfTaps: function (this: unknown) { return this; },
      onEnd: function (this: unknown) { return this; },
    }),
    Simultaneous: (..._gestures: unknown[]) => ({}),
  };
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      require('react').createElement(View, { testID: 'gesture-detector' }, children),
    Gesture,
  };
});

import ImageZoomRotate, { clampScale, IDENTITY_TRANSFORM } from '../src/components/ImageZoomRotate';

describe('clampScale', () => {
  it('returns value within range unchanged', () => {
    expect(clampScale(2, 1, 10)).toBe(2);
  });

  it('clamps below minScale to minScale', () => {
    expect(clampScale(0.5, 1, 10)).toBe(1);
  });

  it('clamps above maxScale to maxScale', () => {
    expect(clampScale(15, 1, 10)).toBe(10);
  });

  it('accepts custom min/max', () => {
    expect(clampScale(0.3, 0.5, 3)).toBe(0.5);
    expect(clampScale(5, 0.5, 3)).toBe(3);
  });

  it('returns minScale when value equals minScale', () => {
    expect(clampScale(1, 1, 10)).toBe(1);
  });

  it('returns maxScale when value equals maxScale', () => {
    expect(clampScale(10, 1, 10)).toBe(10);
  });
});

describe('IDENTITY_TRANSFORM', () => {
  it('has scale of 1', () => {
    expect(IDENTITY_TRANSFORM.scale).toBe(1);
  });

  it('has rotation of 0', () => {
    expect(IDENTITY_TRANSFORM.rotation).toBe(0);
  });
});

describe('ImageZoomRotate', () => {
  it('renders children inside the container', () => {
    const { getByText } = render(
      <ImageZoomRotate>
        <Text>hello image</Text>
      </ImageZoomRotate>,
    );
    expect(getByText('hello image')).toBeTruthy();
  });

  it('wraps children in a GestureDetector', () => {
    const { getByTestId } = render(
      <ImageZoomRotate>
        <Text>child</Text>
      </ImageZoomRotate>,
    );
    expect(getByTestId('gesture-detector')).toBeTruthy();
  });

  it('renders with default minScale=1 and maxScale=10 without crashing', () => {
    expect(() =>
      render(
        <ImageZoomRotate>
          <Text>default props</Text>
        </ImageZoomRotate>,
      ),
    ).not.toThrow();
  });

  it('accepts custom minScale and maxScale props without crashing', () => {
    expect(() =>
      render(
        <ImageZoomRotate minScale={0.5} maxScale={5}>
          <Text>custom scale</Text>
        </ImageZoomRotate>,
      ),
    ).not.toThrow();
  });

  it('renders multiple children', () => {
    const { getByText } = render(
      <ImageZoomRotate>
        <Text>first</Text>
        <Text>second</Text>
      </ImageZoomRotate>,
    );
    expect(getByText('first')).toBeTruthy();
    expect(getByText('second')).toBeTruthy();
  });
});

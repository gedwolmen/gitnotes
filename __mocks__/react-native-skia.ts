/**
 * Test mock for @shopify/react-native-skia.
 *
 * Skia is a JSI-backed native module whose install path throws when the
 * `RNSkiaModule` TurboModule is not registered (jest's node environment has no
 * native binary). The component layer we actually exercise in these tests only
 * cares about Skia's React component surface, so we map every renderable to a
 * plain View and stub the rest with harmless no-ops.
 */
import type * as React from 'react';
const { View } = require('react-native');

const passthrough = (name: string) => {
  const Component = ({ children, ...rest }: { children?: React.ReactNode }) =>
    require('react').createElement(View, rest, children);
  Component.displayName = name;
  return Component;
};

module.exports = {
  __esModule: true,
  Canvas: passthrough('Canvas'),
  Group: passthrough('Group'),
  Rect: passthrough('Rect'),
  RoundedRect: passthrough('RoundedRect'),
  Oval: passthrough('Oval'),
  Path: passthrough('Path'),
  Fill: passthrough('Fill'),
  Image: passthrough('Image'),
  Text: passthrough('Text'),
  matchFont: () => null,
  Skia: {
    Path: { Make: () => ({ moveTo: () => {}, lineTo: () => {}, close: () => {} }) },
    XYWHRect: () => ({}),
    RRect: () => ({}),
    Font: { Make: () => null },
  },
  useFont: () => null,
  useTypeface: () => null,
  useValue: () => ({ current: 0 }),
  default: passthrough('Canvas'),
};

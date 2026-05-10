import React from 'react';
import { render } from '@testing-library/react-native';

const stableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  surfaceSecondary: '#f0f0f0',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
  accent: '#8b5cf6',
};

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('../../src/components/CodeBlock', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View /> };
});

jest.mock('../../src/components/KatexView', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View /> };
});

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: stableColors, isDark: false }),
  useTokens: () => ({
    colors: stableColors,
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 },
    radii: { sm: 12, md: 18, lg: 24, pill: 999 },
    style: 'flat',
  }),
}));

jest.mock('../../src/stores/renderStyleStore', () => ({
  useRenderStyle: () => ({}),
}));

import StructuredRenderer from '../../src/components/StructuredRenderer';
import type { NeorgContentBlock } from '../../src/models/NeorgContent';

function renderBlocks(blocks: NeorgContentBlock[], format: 'neorg' | 'org' = 'org') {
  return render(<StructuredRenderer blocks={blocks} format={format} />);
}

describe('StructuredRenderer org behaviours (issue #660)', () => {
  test('PROPERTIES drawer is hidden from rendered output', () => {
    const { queryByText } = renderBlocks([
      {
        type: 'drawer',
        drawer: {
          name: 'PROPERTIES',
          properties: { CATEGORY: 'Research', REVIEWED: '2026-05-08' },
        },
      },
    ]);
    expect(queryByText(':PROPERTIES:')).toBeNull();
    expect(queryByText(/CATEGORY/)).toBeNull();
    expect(queryByText(/Research/)).toBeNull();
    expect(queryByText(/REVIEWED/)).toBeNull();
  });

  test('LOGBOOK drawer also hidden', () => {
    const { queryByText } = renderBlocks([
      {
        type: 'drawer',
        drawer: {
          name: 'LOGBOOK',
          properties: { LINE_1: 'CLOCK: [2026-01-01]' },
        },
      },
    ]);
    expect(queryByText(':LOGBOOK:')).toBeNull();
    expect(queryByText(/CLOCK/)).toBeNull();
  });

  test('drawer surrounded by other blocks does not interrupt them', () => {
    const { getByText, queryByText } = renderBlocks([
      { type: 'paragraph', text: 'Before drawer' },
      {
        type: 'drawer',
        drawer: { name: 'PROPERTIES', properties: { K: 'V' } },
      },
      { type: 'paragraph', text: 'After drawer' },
    ]);
    expect(getByText('Before drawer')).toBeTruthy();
    expect(getByText('After drawer')).toBeTruthy();
    expect(queryByText(':PROPERTIES:')).toBeNull();
  });

  test('heading with TODO + priority + long text renders all three (no clipping/truncation)', () => {
    const { getByText } = renderBlocks([
      {
        type: 'heading',
        heading: {
          level: 3,
          text: 'Compare onboarding flows',
          todoState: 'TODO',
          priority: 'A',
        },
      },
    ]);
    expect(getByText('TODO')).toBeTruthy();
    expect(getByText('#A')).toBeTruthy();
    expect(getByText('Compare onboarding flows')).toBeTruthy();
  });
});

jest.mock('../../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      primary: '#2563eb',
      accent: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
    },
  }),
}));

import type { ResponsiveInfo } from '../../../src/hooks/useResponsive';

const PHONE: ResponsiveInfo = {
  isTablet: false,
  isLandscape: false,
  screenWidth: 390,
  screenHeight: 844,
  columns: 1,
  maxContentWidth: 480,
  sideBySide: false,
  deviceType: 'phone',
  columnCount: 2,
};

const TABLET: ResponsiveInfo = {
  isTablet: true,
  isLandscape: true,
  screenWidth: 900,
  screenHeight: 680,
  columns: 2,
  maxContentWidth: 640,
  sideBySide: false,
  deviceType: 'tablet',
  columnCount: 3,
};

let mockResponsiveValue: ResponsiveInfo = PHONE;

jest.mock('../../../src/hooks/useResponsive', () => ({
  useResponsive: () => mockResponsiveValue,
}));

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ProFeatureBento from '../../../src/components/paywall/ProFeatureBento';

const FEATURE_KEYS = [
  'aiChat',
  'aiActions',
  'thoughtDump',
  'voiceDump',
  'personalizedQuotes',
  'githubTools',
  'canvases',
  'templates',
  'renderStyles',
  'multiAccount',
] as const;

const DESCRIPTIONS: Record<(typeof FEATURE_KEYS)[number], string> = {
  aiChat: 'Ask your notes anything and get instant answers',
  aiActions: 'Summarize, rewrite, and improve text right in the editor',
  thoughtDump: 'Capture quick thoughts as they happen',
  voiceDump: 'Speak your ideas and save them as notes',
  personalizedQuotes: 'Daily quotes tuned to your writing by AI',
  githubTools: 'Give the AI context from your GitHub repos',
  canvases: 'Arrange notes visually on an infinite canvas',
  templates: 'Start new notes from your own templates',
  renderStyles: 'Choose exactly how your notes look',
  multiAccount: 'Connect multiple GitHub accounts side by side',
};

// Same merge approach as __tests__/ui/Surface.test.tsx -- style props may be
// an array of [static, dynamic] entries.
function flattenedStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean)) as Record<string, unknown>;
  }
  return (style ?? {}) as Record<string, unknown>;
}

function fireContainerLayout(
  getByTestId: (testID: string) => React.ReactElement,
  width: number,
): void {
  fireEvent(getByTestId('paywall.features'), 'layout', {
    nativeEvent: { layout: { width } },
  });
}

beforeEach(() => {
  mockResponsiveValue = PHONE;
});

describe('ProFeatureBento', () => {
  it('renders the bento container and all 10 feature cards', () => {
    const { getByTestId } = render(<ProFeatureBento />);
    expect(getByTestId('paywall.features')).toBeTruthy();
    for (const key of FEATURE_KEYS) {
      expect(getByTestId(`paywall.feature.${key}`)).toBeTruthy();
    }
  });

  it('renders titles and descriptions from i18n', () => {
    const { getByText } = render(<ProFeatureBento />);
    expect(getByText('AI chat with your notes')).toBeTruthy();
    expect(getByText('Ask your notes anything and get instant answers')).toBeTruthy();
    expect(getByText('Canvases')).toBeTruthy();
    expect(getByText('Arrange notes visually on an infinite canvas')).toBeTruthy();
  });

  it('phone 2-col layout: hero spans the full row, twice a small card plus gap', () => {
    mockResponsiveValue = PHONE;
    const { getByTestId } = render(<ProFeatureBento />);
    fireContainerLayout(getByTestId, 390);

    const heroWidth = flattenedStyle(getByTestId('paywall.feature.aiChat').props.style).width;
    const smallWidth = flattenedStyle(getByTestId('paywall.feature.aiActions').props.style).width;

    // cardBase = floor((390 - 12) / 2) = 189
    expect(smallWidth).toBe(189);
    // hero = 2 * 189 + 12 = 390
    expect(heroWidth).toBe(390);
    expect(heroWidth).toBe((smallWidth as number) * 2 + 12);
  });

  it('renders an Ionicon per feature card', () => {
    const { getByTestId } = render(<ProFeatureBento />);
    expect(getByTestId('icon-chatbubbles-outline')).toBeTruthy();
    expect(getByTestId('icon-logo-github')).toBeTruthy();
  });

  it('hero card accessibilityLabel contains the title and the description', () => {
    const { getByTestId } = render(<ProFeatureBento />);
    const label = getByTestId('paywall.feature.aiChat').props.accessibilityLabel as string;
    expect(typeof label).toBe('string');
    expect(label).toContain('AI chat with your notes');
    expect(label).toContain('Ask your notes anything and get instant answers');
  });

  it('tablet 3-col layout renders all 10 cards without warnings', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      mockResponsiveValue = TABLET;
      const { getByTestId } = render(<ProFeatureBento />);
      fireContainerLayout(getByTestId, 640);
      expect(getByTestId('paywall.feature.aiChat')).toBeTruthy();
      for (const key of FEATURE_KEYS) {
        expect(getByTestId(`paywall.feature.${key}`)).toBeTruthy();
      }
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('resolves every featureDescription i18n key (raw keys never leak)', () => {
    const { getByTestId, getByText, queryByText } = render(<ProFeatureBento />);
    for (const key of FEATURE_KEYS) {
      expect(queryByText(`paywall.featureDescriptions.${key}`)).toBeNull();
      expect(getByTestId(`paywall.feature.${key}`)).toBeTruthy();
      expect(getByText(DESCRIPTIONS[key])).toBeTruthy();
    }
  });
});

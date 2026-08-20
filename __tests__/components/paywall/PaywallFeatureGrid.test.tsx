import React from 'react';
import { render } from '@testing-library/react-native';

// Jest's default RN window is ~750x1334 (tablet branch). Mutate this object
// per test — the useWindowDimensions mock below reads it lazily at call time.
const mockWindowDimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindowDimensions,
}));

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

jest.mock('../../../src/components/ui', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Surface = (props: Record<string, unknown>) => React.createElement(View, props);
  return { Surface };
});

import PaywallFeatureGrid, {
  columnCountForWidth,
} from '../../../src/components/paywall/PaywallFeatureGrid';

// Expected EN strings from src/i18n/en.json (resolved by the global
// react-i18next mock in jest.setup.ts) plus the icon names from FEATURE_META.
const FEATURES = [
  {
    id: 'aiChat',
    icon: 'chatbubbles',
    title: 'AI chat with your notes',
    desc: 'Ask questions, get answers grounded in your notes',
  },
  {
    id: 'aiActions',
    icon: 'sparkles',
    title: 'AI actions in the editor',
    desc: 'Summarize, rewrite, and fix text right in the editor',
  },
  {
    id: 'thoughtDump',
    icon: 'bulb',
    title: 'Thought dump',
    desc: 'Brain-dump thoughts; AI files them into notes',
  },
  {
    id: 'voiceDump',
    icon: 'mic',
    title: 'Voice dump',
    desc: 'Record voice memos, transcribed straight to notes',
  },
  {
    id: 'personalizedQuotes',
    icon: 'chatbox-ellipses',
    title: 'Personalized daily quotes',
    desc: 'Daily quotes tuned to your notes and interests',
  },
  {
    id: 'githubTools',
    icon: 'logo-github',
    title: 'GitHub tools for AI',
    desc: 'Manage issues and repos from AI chat',
  },
  {
    id: 'canvases',
    icon: 'easel',
    title: 'Canvases',
    desc: 'Connect notes on an infinite visual canvas',
  },
  {
    id: 'templates',
    icon: 'albums',
    title: 'Custom templates',
    desc: 'Build and reuse your own note templates',
  },
  {
    id: 'renderStyles',
    icon: 'color-palette',
    title: 'Render styles',
    desc: 'Theme how Markdown, NORG, and Org render',
  },
  {
    id: 'multiAccount',
    icon: 'people',
    title: 'Multiple GitHub accounts',
    desc: 'Sync multiple GitHub accounts side by side',
  },
];

beforeEach(() => {
  mockWindowDimensions.width = 390;
  mockWindowDimensions.height = 844;
});

describe('columnCountForWidth', () => {
  it('returns 2 columns at phone widths', () => {
    expect(columnCountForWidth(390)).toBe(2);
    expect(columnCountForWidth(639)).toBe(2);
  });

  it('returns 3 columns at tablet widths', () => {
    expect(columnCountForWidth(640)).toBe(3);
    expect(columnCountForWidth(1024)).toBe(3);
  });
});

describe('PaywallFeatureGrid', () => {
  it('renders the grid container and all 10 feature cards at phone width', () => {
    const { getByTestId } = render(<PaywallFeatureGrid />);
    expect(getByTestId('paywall.features')).toBeTruthy();
    for (const feat of FEATURES) {
      expect(getByTestId(`paywall.feature.${feat.id}`)).toBeTruthy();
    }
  });

  it('renders every EN title and description from en.json', () => {
    const { getByText } = render(<PaywallFeatureGrid />);
    for (const feat of FEATURES) {
      expect(getByText(feat.title)).toBeTruthy();
      expect(getByText(feat.desc)).toBeTruthy();
    }
  });

  it('renders the per-feature icon in every card', () => {
    const { getByTestId } = render(<PaywallFeatureGrid />);
    for (const feat of FEATURES) {
      expect(getByTestId(`icon-${feat.icon}`)).toBeTruthy();
    }
  });

  it('uses a 2-column layout with a full-width hero at phone width', () => {
    const { getByTestId } = render(<PaywallFeatureGrid />);
    // usable = 390 - 40 = 350; the hero card spans the whole row.
    const hero = getByTestId('paywall.feature.aiChat');
    expect(hero.props.style.width).toBe(350);
    expect(hero.props.style.height).toBe(120);
    // cardW = (350 - 12) / 2 = 169
    for (const feat of FEATURES.slice(1)) {
      const card = getByTestId(`paywall.feature.${feat.id}`);
      expect(card.props.style.width).toBe(169);
      expect(card.props.style.height).toBe(136);
    }
  });

  it('uses a 3-column layout at tablet width', () => {
    mockWindowDimensions.width = 1024;
    mockWindowDimensions.height = 1366;
    const { getByTestId } = render(<PaywallFeatureGrid />);
    // usable = 1024 - 40 = 984; hero spans the whole row.
    expect(getByTestId('paywall.feature.aiChat').props.style.width).toBe(984);
    // cardW = (984 - 2*12) / 3 = 320 proves the 3-column branch.
    for (const feat of FEATURES.slice(1)) {
      expect(getByTestId(`paywall.feature.${feat.id}`).props.style.width).toBe(320);
    }
  });

  it('labels each card with "title. description" for screen readers', () => {
    const { getByTestId } = render(<PaywallFeatureGrid />);
    for (const feat of FEATURES) {
      expect(getByTestId(`paywall.feature.${feat.id}`).props.accessibilityLabel).toBe(
        `${feat.title}. ${feat.desc}`,
      );
    }
  });
});

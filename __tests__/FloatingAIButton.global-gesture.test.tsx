import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../src/stores/aiStore', () => ({
  useAIStore: () => ({ isEnabled: true }),
}));

jest.mock('../src/contexts/ThemeContext', () => {
  const { NEUMORPHIC_LIGHT, RADII } = require('../src/theme/tokens');

  return {
    useTheme: () => ({ colors: NEUMORPHIC_LIGHT, style: 'neumorphic' }),
    useTokens: () => ({
      colors: NEUMORPHIC_LIGHT,
      radii: RADII,
    }),
  };
});

jest.mock('@shopify/react-native-skia', () => {
  const MockView = require('react-native').View;

  return {
    Canvas: MockView,
    Group: ({ children }: { children: ReactNode }) => children,
    Circle: MockView,
    Paint: ({ children }: { children: ReactNode }) => children,
    Blur: MockView,
    ColorMatrix: MockView,
    DashPathEffect: ({ children }: { children?: ReactNode }) => children ?? null,
  };
});

import { FloatingAIButton } from '../src/components/ai/FloatingAIButton';

describe('FloatingAIButton global Gesture mock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  });

  it('renders the current pan lifecycle chain', async () => {
    const rendered = render(<FloatingAIButton currentRouteName="Home" />);

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(rendered.getByTestId('floating-ai.button.navigate-chat')).toBeTruthy();
    });
  });
});

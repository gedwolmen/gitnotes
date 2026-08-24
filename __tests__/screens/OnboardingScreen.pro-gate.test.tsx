const mockOnComplete = jest.fn();
const mockOnSkip = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import OnboardingScreen from '../../src/screens/OnboardingScreen';
import { __setProState } from '../../src/stores/proStore';
import { OnboardingService } from '../../src/services/OnboardingService';

jest.mock('../../src/contexts/ThemeContext', () => ({
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
  useTokens: () => ({
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
    spacing: [0, 4, 8, 12, 16, 20, 24],
    radii: { pill: 999 },
    type: { sm: 12, md: 14, lg: 16, xl: 18, '2xl': 22 },
  }),
}));

jest.mock('../../src/services/OnboardingService', () => ({
  OnboardingService: {
    completeOnboarding: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: {
    setToken: jest.fn(async (token: string) => ({
      isAuthenticated: token.length > 0,
      user: { login: 'tester' },
    })),
  },
}));

jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    setToken: jest.fn(async () => undefined),
  },
}));

const TOKEN_STEP_INDEX = 5;
const AI_STEP_INDEX = 6;

beforeEach(() => {
  jest.clearAllMocks();
  __setProState({
    status: 'free',
    entitlementActive: false,
    isGrandfathered: false,
  });
});

async function advanceToAIStep(getByTestId: ReturnType<typeof render>['getByTestId']) {
  for (let i = 0; i < TOKEN_STEP_INDEX; i++) {
    fireEvent.press(getByTestId('onboarding.button.next'));
  }
  fireEvent.press(getByTestId('onboarding.button.next'));
}

describe('OnboardingScreen — GitHub Tools Pro gate', () => {
  const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

  it('shows the report-issue footer link and opens GitHub issues on press', () => {
    const { getByTestId } = render(
      <OnboardingScreen onComplete={mockOnComplete} onSkip={mockOnSkip} />
    );

    expect(getByTestId('onboarding.button.report-issue')).toBeTruthy();
    fireEvent.press(getByTestId('onboarding.button.report-issue'));
    expect(openUrlSpy).toHaveBeenCalledWith('https://github.com/gedwolmen/gitnotes/issues');
  });

  it('completes onboarding for non-Pro users on AI step', async () => {
    const { getByTestId, queryByTestId } = render(
      <OnboardingScreen onComplete={mockOnComplete} onSkip={mockOnSkip} />
    );

    await advanceToAIStep(getByTestId);

    expect(getByTestId('onboarding.button.pro-continue')).toBeTruthy();
    fireEvent.press(getByTestId('onboarding.button.pro-continue'));

    await waitFor(() => {
      expect(OnboardingService.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });

    expect(queryByTestId('onboarding.button.enable-github-tools')).toBeNull();
    expect(queryByTestId('onboarding.button.skip-github-tools')).toBeNull();
  });

  it('completes onboarding for Pro users on AI step', async () => {
    __setProState({ status: 'pro', entitlementActive: true, isGrandfathered: false });

    const { getByTestId, queryByTestId } = render(
      <OnboardingScreen onComplete={mockOnComplete} onSkip={mockOnSkip} />
    );

    await advanceToAIStep(getByTestId);
    fireEvent.press(getByTestId('onboarding.button.pro-continue'));

    await waitFor(() => {
      expect(OnboardingService.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });

    expect(queryByTestId('onboarding.button.enable-github-tools')).toBeNull();
    expect(queryByTestId('onboarding.button.skip-github-tools')).toBeNull();
  });

  it('completes onboarding for grandfathered users on AI step', async () => {
    __setProState({ status: 'pro', entitlementActive: false, isGrandfathered: true });

    const { getByTestId } = render(
      <OnboardingScreen onComplete={mockOnComplete} onSkip={mockOnSkip} />
    );

    await advanceToAIStep(getByTestId);
    fireEvent.press(getByTestId('onboarding.button.pro-continue'));

    await waitFor(() => {
      expect(OnboardingService.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });
  });
});

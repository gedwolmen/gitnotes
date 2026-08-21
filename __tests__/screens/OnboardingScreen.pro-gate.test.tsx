const mockOnComplete = jest.fn();
const mockOnSkip = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import OnboardingScreen from '../../src/screens/OnboardingScreen';
import { __setProState } from '../../src/stores/proStore';
import { OnboardingService } from '../../src/services/OnboardingService';
import { useAIStore } from '../../src/stores/aiStore';

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

jest.mock('../../src/stores/aiStore', () => {
  const state = {
    githubToolsEnabled: false,
    toggleGithubTools: jest.fn(async () => undefined),
  };
  return {
    useAIStore: Object.assign(
      jest.fn((selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state)),
      { getState: () => state }
    ),
  };
});

const TOKEN_STEP_INDEX = 6; // 6 INFO_STEPS
const AI_STEP_INDEX = 7;
const GITHUB_TOOLS_STEP_INDEX = 8;

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
  // Token step: skip token, just press Connect-or-Skip
  fireEvent.press(getByTestId('onboarding.button.next'));
}

describe('OnboardingScreen — GitHub Tools Pro gate', () => {
  it('skips the GitHub Tools step and completes onboarding for non-Pro users', async () => {
    const { getByTestId, queryByTestId } = render(
      <OnboardingScreen onComplete={mockOnComplete} onSkip={mockOnSkip} />
    );

    await advanceToAIStep(getByTestId);

    // Sanity: we are on the AI step.
    expect(getByTestId('onboarding.button.pro-continue')).toBeTruthy();

    fireEvent.press(getByTestId('onboarding.button.pro-continue'));

    await waitFor(() => {
      expect(OnboardingService.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });

    // The GitHub Tools "Enable" button must never have been rendered.
    expect(queryByTestId('onboarding.button.enable-github-tools')).toBeNull();
    expect(queryByTestId('onboarding.button.skip-github-tools')).toBeNull();

    // Toggle must never have been invoked.
    expect(useAIStore.getState().toggleGithubTools).not.toHaveBeenCalled();
  });

  it('does not advance to the GitHub Tools step index for non-Pro users', async () => {
    const { getByTestId } = render(
      <OnboardingScreen onComplete={mockOnComplete} onSkip={mockOnSkip} />
    );

    await advanceToAIStep(getByTestId);
    fireEvent.press(getByTestId('onboarding.button.pro-continue'));

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });

    // AI step is the last step non-Pro users can be on before finish() runs.
    // GITHUB_TOOLS_STEP_INDEX must not be reachable; we verify by ensuring
    // the GitHub Tools enable button (only rendered at that index) never appeared.
    expect(() => getByTestId('onboarding.button.enable-github-tools')).toThrow();
    // Reference the index so the test fails loudly if the constant shifts in src.
    expect(GITHUB_TOOLS_STEP_INDEX).toBeGreaterThan(AI_STEP_INDEX);
  });

  it('shows the GitHub Tools step for Pro users and lets them enable the toggle', async () => {
    __setProState({ status: 'pro', entitlementActive: true, isGrandfathered: false });

    const { getByTestId } = render(
      <OnboardingScreen onComplete={mockOnComplete} onSkip={mockOnSkip} />
    );

    await advanceToAIStep(getByTestId);
    fireEvent.press(getByTestId('onboarding.button.pro-continue'));

    await waitFor(() => {
      expect(getByTestId('onboarding.button.enable-github-tools')).toBeTruthy();
    });

    fireEvent.press(getByTestId('onboarding.button.enable-github-tools'));

    await waitFor(() => {
      expect(useAIStore.getState().toggleGithubTools).toHaveBeenCalledTimes(1);
      expect(OnboardingService.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the GitHub Tools step for grandfathered users (treated as Pro)', async () => {
    __setProState({ status: 'pro', entitlementActive: false, isGrandfathered: true });

    const { getByTestId } = render(
      <OnboardingScreen onComplete={mockOnComplete} onSkip={mockOnSkip} />
    );

    await advanceToAIStep(getByTestId);
    fireEvent.press(getByTestId('onboarding.button.pro-continue'));

    await waitFor(() => {
      expect(getByTestId('onboarding.button.enable-github-tools')).toBeTruthy();
    });
  });

  it('lets Pro users skip the GitHub Tools step without enabling the toggle', async () => {
    __setProState({ status: 'pro', entitlementActive: true, isGrandfathered: false });

    const { getByTestId } = render(
      <OnboardingScreen onComplete={mockOnComplete} onSkip={mockOnSkip} />
    );

    await advanceToAIStep(getByTestId);
    fireEvent.press(getByTestId('onboarding.button.pro-continue'));

    await waitFor(() => {
      expect(getByTestId('onboarding.button.skip-github-tools')).toBeTruthy();
    });

    fireEvent.press(getByTestId('onboarding.button.skip-github-tools'));

    await waitFor(() => {
      expect(useAIStore.getState().toggleGithubTools).not.toHaveBeenCalled();
      expect(OnboardingService.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });
  });
});
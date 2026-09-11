/**
 * PaywallScreen restore button tap test.
 *
 * Verifies:
 * - render PaywallScreen with @testing-library/react-native
 * - press testID="paywall.restore"
 * - restore is called exactly once from that tap interaction
 * - restore is NOT called on mount (before any tap)
 */
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockRestore = jest.fn();

jest.mock('@/stores/proStore', () => {
  const mockLoadOfferingsIfNeeded = jest.fn();
  const MockedStore = (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      status: 'free',
      entitlementActive: false,
      trialActive: false,
      trialEndsAt: null,
      entitlementExpiresAt: null,
      offeringsReady: true,
      monthlyPackage: null,
      yearlyPackage: null,
      lifetimePackage: null,
      currentOffering: null,
      isPurchasing: false,
      isRestoring: false,
      error: null,
      interstitialEligible: false,
      configured: true,
      loadOfferingsIfNeeded: mockLoadOfferingsIfNeeded,
      restore: mockRestore,
    });
  Object.assign(MockedStore, {
    getState: () => ({
      status: 'free',
      entitlementActive: false,
      trialActive: false,
      trialEndsAt: null,
      entitlementExpiresAt: null,
      offeringsReady: true,
      monthlyPackage: null,
      yearlyPackage: null,
      lifetimePackage: null,
      currentOffering: null,
      isPurchasing: false,
      isRestoring: false,
      error: null,
      interstitialEligible: false,
      configured: true,
      restore: mockRestore,
      loadOfferingsIfNeeded: mockLoadOfferingsIfNeeded,
    }),
    setState: jest.fn(),
    subscribe: () => (() => { /* noop */ }),
    getInitialState: () => ({}),
  });
  return { useProStore: MockedStore };
});

jest.mock('@/services/RevenueCatService', () => ({
  getIntroEligibilities: jest.fn().mockResolvedValue({}),
  trackPaywallImpression: jest.fn(),
}));

jest.mock('@/services/PaywallAnalytics', () => ({
  trackPaywallOpen: jest.fn(),
  trackPaywallClose: jest.fn(),
  trackCtaTap: jest.fn(),
  trackRestoreTap: jest.fn(),
  trackRestoreOutcome: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
}));

jest.mock('@/contexts/ThemeContext', () => {
  const mockColors = {
    background: '#ffffff',
    text: '#000000',
    textSecondary: '#666666',
    accent: '#0066ff',
    error: '#ff0000',
    surface: '#ffffff',
    border: '#dddddd',
    card: '#eeeeee',
    success: '#00aa00',
    warning: '#ffaa00',
  };
  return {
    useTheme: () => ({ colors: mockColors, style: {}, isDark: false }),
    useTokens: () => ({
      colors: mockColors,
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
      radii: { sm: 4, md: 8, lg: 16, full: 9999 },
      type: 'light' as const,
    }),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: jest.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

import PaywallScreen from '@/screens/PaywallScreen';

describe('PaywallScreen restore button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRestore.mockResolvedValue('nothing');
  });

  it('does NOT call restore on mount', async () => {
    const { getByTestId } = render(<PaywallScreen />);

    await waitFor(() => {
      expect(getByTestId('paywall.restore')).toBeTruthy();
    });

    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('calls restore exactly once when user taps paywall.restore', async () => {
    const { getByTestId } = render(<PaywallScreen />);

    await waitFor(() => {
      expect(getByTestId('paywall.restore')).toBeTruthy();
    });

    fireEvent.press(getByTestId('paywall.restore'));

    await waitFor(() => {
      expect(mockRestore).toHaveBeenCalledTimes(1);
    });
  });
});

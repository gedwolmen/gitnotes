const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack, canGoBack: () => true }),
}));

jest.mock('../../src/services/RevenueCatService', () => ({
  isTrialEligible: jest.fn(async () => false),
}));

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
}));

jest.mock('../../src/components/ui', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    useScreenHeaderHeight: () => 60,
    SafeAreaView: ({ children }: any) => React.createElement(View, null, children),
    ScreenHeader: ({ title, actions }: any) =>
      React.createElement(View, null, actions, React.createElement(Text, null, title)),
    Button: ({ label, onPress, testID, disabled }: any) =>
      React.createElement(
        TouchableOpacity,
        { testID, disabled, onPress },
        React.createElement(Text, null, label),
      ),
    Surface: ({ children, style }: any) => React.createElement(View, { style }, children),
  };
});

import React from 'react';
import { fireEvent, render, act } from '@testing-library/react-native';
import PaywallScreen from '../../src/screens/PaywallScreen';
import { isTrialEligible } from '../../src/services/RevenueCatService';
import { __setProState } from '../../src/stores/proStore';

const trialEligibleMock = isTrialEligible as jest.Mock;

const monthlyPkg = { identifier: 'monthly', product: { identifier: 'monthly-product', priceString: '$2.99' } };
const yearlyPkg = { identifier: 'yearly', product: { identifier: 'yearly-product', priceString: '$19.99' } };
const lifetimePkg = { identifier: 'lifetime', product: { identifier: 'lifetime-product', priceString: '$40.00' } };

function setReadyState(overrides: Record<string, unknown> = {}): void {
  __setProState({
    status: 'free',
    entitlementActive: false,
    isGrandfathered: false,
    trialActive: false,
    trialEndsAt: null,
    isPurchasing: false,
    isRestoring: false,
    error: null,
    interstitialEligible: false,
    offeringsReady: true,
    monthlyPackage: monthlyPkg,
    yearlyPackage: null,
    lifetimePackage: lifetimePkg,
    configured: true,
    purchaseMonthly: jest.fn(async () => undefined),
    purchaseYearly: jest.fn(async () => undefined),
    purchaseLifetime: jest.fn(async () => undefined),
    restore: jest.fn(async () => undefined),
    loadOfferingsIfNeeded: jest.fn(async () => undefined),
    markInterstitialShown: jest.fn(async () => undefined),
    initialize: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  trialEligibleMock.mockResolvedValue(false);
  setReadyState();
});

describe('PaywallScreen', () => {
  it('shows a loading state while offerings are not ready', () => {
    __setProState({ offeringsReady: false, monthlyPackage: null, lifetimePackage: null });
    const { getByTestId } = render(<PaywallScreen />);
    expect(getByTestId('paywall.loading')).toBeTruthy();
  });

  it('renders the feature list, pricing, and restore once offerings are ready', () => {
    const { getByTestId, getByText } = render(<PaywallScreen />);
    expect(getByTestId('paywall.features')).toBeTruthy();
    expect(getByTestId('paywall.monthly.cta')).toBeTruthy();
    expect(getByTestId('paywall.lifetime.cta')).toBeTruthy();
    expect(getByTestId('paywall.restore')).toBeTruthy();
    expect(getByText('AI chat with your notes')).toBeTruthy();
    expect(getByText('Multiple GitHub accounts')).toBeTruthy();
  });

  it('uses the trial CTA label for the monthly option when the user is trial-eligible', async () => {
    trialEligibleMock.mockResolvedValue(true);
    const { findAllByText } = render(<PaywallScreen />);
    const matches = await findAllByText('Try 30 days free, then $2.99/month');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('uses the plain price label when the user is not trial-eligible', () => {
    const { getByText } = render(<PaywallScreen />);
    expect(getByText('$2.99/month')).toBeTruthy();
  });

  it('shows the lifetime CTA with the price', () => {
    const { getByText } = render(<PaywallScreen />);
    expect(getByText('$40.00 one-time')).toBeTruthy();
  });

  it('hides the yearly option when no yearly package is offered', () => {
    const { queryByTestId } = render(<PaywallScreen />);
    expect(queryByTestId('paywall.yearly.cta')).toBeNull();
  });

  it('shows and purchases the yearly option when a yearly package exists', async () => {
    const purchaseYearly = jest.fn(async () => {
      __setProState({ status: 'pro', entitlementActive: true });
    });
    setReadyState({ yearlyPackage: yearlyPkg, purchaseYearly });
    const { getByTestId, getByText } = render(<PaywallScreen />);
    expect(getByTestId('paywall.yearly.cta')).toBeTruthy();
    expect(getByText('$19.99/year')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('paywall.yearly.cta'));
    });
    expect(purchaseYearly).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('purchases the monthly package and goes back when the purchase succeeds', async () => {
    const purchaseMonthly = jest.fn(async () => {
      __setProState({ status: 'pro', entitlementActive: true });
    });
    setReadyState({ purchaseMonthly });
    const { getByTestId } = render(<PaywallScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('paywall.monthly.cta'));
    });
    expect(purchaseMonthly).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('purchases the lifetime package', async () => {
    const purchaseLifetime = jest.fn(async () => {
      __setProState({ status: 'pro', entitlementActive: true });
    });
    setReadyState({ purchaseLifetime });
    const { getByTestId } = render(<PaywallScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('paywall.lifetime.cta'));
    });
    expect(purchaseLifetime).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('restores purchases and goes back when a purchase is found', async () => {
    const restore = jest.fn(async () => {
      __setProState({ status: 'pro', entitlementActive: true });
    });
    setReadyState({ restore });
    const { getByTestId } = render(<PaywallScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('paywall.restore'));
    });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('shows an error banner with a retry button when offerings fail', () => {
    const loadOfferingsIfNeeded = jest.fn(async () => undefined);
    setReadyState({ error: 'no offerings', loadOfferingsIfNeeded });
    const { getByTestId } = render(<PaywallScreen />);
    expect(getByTestId('paywall.error')).toBeTruthy();
    loadOfferingsIfNeeded.mockClear();
    fireEvent.press(getByTestId('paywall.retry'));
    expect(loadOfferingsIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('dismisses via the close button', () => {
    const { getByTestId } = render(<PaywallScreen />);
    fireEvent.press(getByTestId('paywall.close'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('ignores purchase taps while a purchase is in flight', () => {
    const purchaseMonthly = jest.fn(async () => undefined);
    setReadyState({ isPurchasing: true, purchaseMonthly });
    const { getByTestId } = render(<PaywallScreen />);
    fireEvent.press(getByTestId('paywall.monthly.cta'));
    fireEvent.press(getByTestId('paywall.lifetime.cta'));
    expect(purchaseMonthly).not.toHaveBeenCalled();
  });
});

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack, canGoBack: () => true }),
}));

// Same precedent as PaywallFeatureGrid.test.tsx: jest's default RN window
// (~750x1334) would take the grid's tablet branch.
const mockWindowDimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindowDimensions,
}));

// The screen consumes trackPaywallImpression + getIntroEligibilities —
// missing them from this factory crashes every render (#935 plan, Metis B1).
jest.mock('../../src/services/RevenueCatService', () => ({
  trackPaywallImpression: jest.fn(async () => undefined),
  getIntroEligibilities: jest.fn(async () => ({})),
}));

jest.mock('../../src/services/PaywallAnalytics', () => ({
  trackPaywallOpen: jest.fn(),
  trackPaywallClose: jest.fn(),
  trackCtaTap: jest.fn(),
  trackPurchaseAttempt: jest.fn(),
  trackPurchaseOutcome: jest.fn(),
  trackRestoreTap: jest.fn(),
  trackRestoreOutcome: jest.fn(),
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
    // Forward all props (testID, accessibilityLabel, style) so the restore
    // banner and bento cards stay assertable.
    Surface: (props: any) => React.createElement(View, props),
  };
});

import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, act } from '@testing-library/react-native';
import PaywallScreen from '../../src/screens/PaywallScreen';
import {
  trackPaywallImpression,
  getIntroEligibilities,
} from '../../src/services/RevenueCatService';
import * as PaywallAnalytics from '../../src/services/PaywallAnalytics';
import { __setProState } from '../../src/stores/proStore';

const impressionMock = trackPaywallImpression as jest.Mock;
const eligibilityMock = getIntroEligibilities as jest.Mock;
const analytics = PaywallAnalytics as jest.Mocked<typeof PaywallAnalytics>;

const monthlyPkg = { identifier: 'monthly', product: { identifier: 'monthly-product', priceString: '$2.99' } };
const yearlyPkg = { identifier: 'yearly', product: { identifier: 'yearly-product', priceString: '$19.99' } };
const lifetimePkg = { identifier: 'lifetime', product: { identifier: 'lifetime-product', priceString: '$40.00' } };

const FEATURE_IDS = [
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
];

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
    currentOffering: null,
    configured: true,
    purchaseMonthly: jest.fn(async () => undefined),
    purchaseYearly: jest.fn(async () => undefined),
    purchaseLifetime: jest.fn(async () => undefined),
    restore: jest.fn(async () => 'nothing' as const),
    loadOfferingsIfNeeded: jest.fn(async () => undefined),
    markInterstitialShown: jest.fn(async () => undefined),
    initialize: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    ...overrides,
  });
}

// render() wraps itself in act — flush a separate async act afterwards so
// the intro-eligibility promise state update lands before assertions.
async function renderScreen() {
  const api = render(<PaywallScreen />);
  await act(async () => {});
  return api;
}

let openUrlSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  impressionMock.mockResolvedValue(undefined);
  eligibilityMock.mockResolvedValue({});
  openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  setReadyState();
});

afterEach(() => {
  openUrlSpy.mockRestore();
});

describe('PaywallScreen', () => {
  it('shows a loading state while offerings are not ready', async () => {
    setReadyState({ offeringsReady: false, monthlyPackage: null, lifetimePackage: null });
    const { getByTestId } = await renderScreen();
    expect(getByTestId('paywall.loading')).toBeTruthy();
  });

  it('renders the bento grid, pricing, restore, and legal footer once offerings are ready', async () => {
    const { getByTestId, getByText } = await renderScreen();
    expect(getByTestId('paywall.features')).toBeTruthy();
    for (const id of FEATURE_IDS) {
      expect(getByTestId(`paywall.feature.${id}`)).toBeTruthy();
    }
    expect(getByText('AI chat with your notes')).toBeTruthy();
    expect(getByText('Multiple GitHub accounts')).toBeTruthy();
    expect(getByTestId('paywall.monthly.cta')).toBeTruthy();
    expect(getByTestId('paywall.lifetime.cta')).toBeTruthy();
    expect(getByText('Monthly')).toBeTruthy();
    expect(getByText('Lifetime')).toBeTruthy();
    expect(getByTestId('paywall.restore')).toBeTruthy();
    expect(getByTestId('paywall.terms-link')).toBeTruthy();
    expect(getByTestId('paywall.privacy-link')).toBeTruthy();
  });

  it('tracks a paywall impression with the current offering when configured', async () => {
    const offering = { identifier: 'standard-offering' };
    setReadyState({ currentOffering: offering });
    await renderScreen();
    expect(impressionMock).toHaveBeenCalledTimes(1);
    expect(impressionMock).toHaveBeenCalledWith(offering);
  });

  it('does not track an impression when RevenueCat is not configured', async () => {
    setReadyState({ configured: false });
    await renderScreen();
    expect(impressionMock).not.toHaveBeenCalled();
  });

  it('tracks paywall open on mount and close with dwell time on unmount', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(1_000_000);
      const view = render(<PaywallScreen />);
      expect(analytics.trackPaywallOpen).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(7_500);
      view.unmount();
      expect(analytics.trackPaywallClose).toHaveBeenCalledWith(7_500, false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports the close event as converted when the user is pro at unmount', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(2_000_000);
      const view = render(<PaywallScreen />);
      __setProState({ status: 'pro' });
      view.unmount();
      expect(analytics.trackPaywallClose).toHaveBeenCalledWith(0, true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('tracks the CTA tap with the product id before purchasing', async () => {
    const purchaseMonthly = jest.fn(async () => undefined);
    setReadyState({ purchaseMonthly });
    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId('paywall.monthly.cta'));
    });
    expect(analytics.trackCtaTap).toHaveBeenCalledWith('monthly-product');
    expect(purchaseMonthly).toHaveBeenCalledTimes(1);
    expect(analytics.trackCtaTap.mock.invocationCallOrder[0]).toBeLessThan(
      purchaseMonthly.mock.invocationCallOrder[0],
    );
  });

  it('uses the trial CTA label for the monthly option when the product is trial-eligible', async () => {
    eligibilityMock.mockResolvedValue({ 'monthly-product': true });
    const { getAllByText } = await renderScreen();
    expect(getAllByText('Try 30 days free, then $2.99/month').length).toBeGreaterThanOrEqual(1);
  });

  it('uses the plain price label when the user is not trial-eligible', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('$2.99/month')).toBeTruthy();
  });

  it('uses the yearly trial price line when the yearly product is trial-eligible', async () => {
    eligibilityMock.mockResolvedValue({ 'yearly-product': true });
    setReadyState({ yearlyPackage: yearlyPkg });
    const { getByText } = await renderScreen();
    expect(getByText('Try 30 days free, then $19.99/year')).toBeTruthy();
  });

  it('uses the standard yearly price line when the yearly product is not trial-eligible', async () => {
    setReadyState({ yearlyPackage: yearlyPkg });
    const { getByText } = await renderScreen();
    expect(getByText('$19.99/year')).toBeTruthy();
  });

  it('shows the lifetime CTA with the price', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('$40.00 one-time')).toBeTruthy();
  });

  it('hides the yearly option when no yearly package is offered', async () => {
    const { queryByTestId } = await renderScreen();
    expect(queryByTestId('paywall.yearly.cta')).toBeNull();
  });

  it('hides the lifetime option when no lifetime package is offered', async () => {
    setReadyState({ lifetimePackage: null });
    const { queryByTestId } = await renderScreen();
    expect(queryByTestId('paywall.lifetime.cta')).toBeNull();
  });

  it('shows and purchases the yearly option when a yearly package exists', async () => {
    const purchaseYearly = jest.fn(async () => {
      __setProState({ status: 'pro', entitlementActive: true });
    });
    setReadyState({ yearlyPackage: yearlyPkg, purchaseYearly });
    const { getByTestId, getByText } = await renderScreen();
    expect(getByTestId('paywall.yearly.cta')).toBeTruthy();
    expect(getByText('$19.99/year')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('paywall.yearly.cta'));
    });
    expect(analytics.trackCtaTap).toHaveBeenCalledWith('yearly-product');
    expect(purchaseYearly).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('purchases the monthly package and goes back when the purchase succeeds', async () => {
    const purchaseMonthly = jest.fn(async () => {
      __setProState({ status: 'pro', entitlementActive: true });
    });
    setReadyState({ purchaseMonthly });
    const { getByTestId } = await renderScreen();
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
    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId('paywall.lifetime.cta'));
    });
    expect(purchaseLifetime).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('restores purchases and goes back when a purchase is found', async () => {
    const restore = jest.fn(async () => {
      __setProState({ status: 'pro', entitlementActive: true });
      return 'restored' as const;
    });
    setReadyState({ restore });
    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId('paywall.restore'));
    });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(analytics.trackRestoreTap).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('shows the restoring indicator while a restore is in flight', async () => {
    setReadyState({ isRestoring: true });
    const { getByTestId, getByText } = await renderScreen();
    expect(getByTestId('paywall.restoring')).toBeTruthy();
    expect(getByText('Restoring purchase…')).toBeTruthy();
  });

  it('shows the nothing-to-restore banner when nothing is found', async () => {
    const restore = jest.fn(async () => 'nothing' as const);
    setReadyState({ restore });
    const { getByTestId, getByText, queryByTestId } = await renderScreen();
    expect(queryByTestId('paywall.restore-nothing')).toBeNull();
    await act(async () => {
      fireEvent.press(getByTestId('paywall.restore'));
    });
    expect(getByTestId('paywall.restore-nothing')).toBeTruthy();
    expect(getByText('Nothing to restore on this device.')).toBeTruthy();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('clears the nothing-to-restore banner on the next purchase attempt', async () => {
    const restore = jest.fn(async () => 'nothing' as const);
    setReadyState({ restore });
    const { getByTestId, queryByTestId } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId('paywall.restore'));
    });
    expect(getByTestId('paywall.restore-nothing')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('paywall.monthly.cta'));
    });
    expect(queryByTestId('paywall.restore-nothing')).toBeNull();
  });

  it('does not navigate or show the nothing banner when restore errors', async () => {
    const restore = jest.fn(async () => 'error' as const);
    setReadyState({ restore });
    const { getByTestId, queryByTestId } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId('paywall.restore'));
    });
    expect(queryByTestId('paywall.restore-nothing')).toBeNull();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('shows an error banner with a retry button when offerings fail', async () => {
    const loadOfferingsIfNeeded = jest.fn(async () => undefined);
    setReadyState({ error: 'no offerings', loadOfferingsIfNeeded });
    const { getByTestId } = await renderScreen();
    expect(getByTestId('paywall.error')).toBeTruthy();
    loadOfferingsIfNeeded.mockClear();
    fireEvent.press(getByTestId('paywall.retry'));
    expect(loadOfferingsIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('dismisses via the close button', async () => {
    const { getByTestId } = await renderScreen();
    fireEvent.press(getByTestId('paywall.close'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('ignores purchase taps while a purchase is in flight', async () => {
    const purchaseMonthly = jest.fn(async () => undefined);
    setReadyState({ isPurchasing: true, purchaseMonthly });
    const { getByTestId } = await renderScreen();
    fireEvent.press(getByTestId('paywall.monthly.cta'));
    fireEvent.press(getByTestId('paywall.lifetime.cta'));
    expect(purchaseMonthly).not.toHaveBeenCalled();
  });

  it('opens the terms and privacy legal links via Linking', async () => {
    const { getByTestId, getByText } = await renderScreen();
    expect(getByText('Terms of Use')).toBeTruthy();
    expect(getByText('Privacy Policy')).toBeTruthy();
    expect(getByTestId('paywall.terms-link').props.accessibilityRole).toBe('link');
    expect(getByTestId('paywall.privacy-link').props.accessibilityRole).toBe('link');
    fireEvent.press(getByTestId('paywall.terms-link'));
    expect(openUrlSpy).toHaveBeenCalledWith('https://www.gitnotes.org/terms');
    fireEvent.press(getByTestId('paywall.privacy-link'));
    expect(openUrlSpy).toHaveBeenCalledWith('https://www.gitnotes.org/privacy');
  });
});

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { useProGate } from '../../src/hooks/useProGate';
import { __setProState } from '../../src/stores/proStore';

function Harness() {
  const { isPro, loading, openPaywall } = useProGate();
  return (
    <View>
      <Text testID="isPro">{String(isPro)}</Text>
      <Text testID="loading">{String(loading)}</Text>
      <TouchableOpacity testID="open" onPress={openPaywall} />
    </View>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  __setProState({
    status: 'pro',
    entitlementActive: true,
    isGrandfathered: false,
    isPurchasing: false,
    isRestoring: false,
    error: null,
    interstitialEligible: false,
    monthlyPackage: null,
    lifetimePackage: null,
    trialActive: false,
    trialEndsAt: null,
    configured: true,
  });
});

describe('useProGate', () => {
  it('reports pro when the entitlement is active', () => {
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('isPro').props.children).toBe('true');
    expect(getByTestId('loading').props.children).toBe('false');
  });

  it('reports free when the user has no entitlement and is not grandfathered', () => {
    __setProState({ status: 'free', entitlementActive: false, isGrandfathered: false });
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('isPro').props.children).toBe('false');
  });

  it('reports pro for a grandfathered user even without an entitlement', () => {
    __setProState({ status: 'pro', entitlementActive: false, isGrandfathered: true });
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('isPro').props.children).toBe('true');
  });

  it('navigates to the Paywall route from openPaywall', () => {
    const { getByTestId } = render(<Harness />);
    fireEvent.press(getByTestId('open'));
    expect(mockNavigate).toHaveBeenCalledWith('Paywall');
  });
});

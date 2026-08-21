import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

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
  const { View, Text, TouchableOpacity } = require('react-native');
  const Surface = (props: Record<string, unknown>) => React.createElement(View, props);
  const Button = (props: { label?: string; onPress?: () => void; testID?: string; disabled?: boolean }) =>
    React.createElement(
      TouchableOpacity,
      { testID: props.testID, disabled: props.disabled, onPress: props.onPress },
      React.createElement(Text, null, props.label),
    );
  return { Surface, Button };
});

import PaywallPlanGrid, { PlanTileData } from '../../../src/components/paywall/PaywallPlanGrid';

function plan(overrides: Partial<PlanTileData> & { id: PlanTileData['id'] }): PlanTileData {
  return {
    title: 'Title',
    priceLine: '$9.99',
    ctaLabel: 'Subscribe',
    ctaTestID: `paywall.${overrides.id}.cta`,
    variant: 'secondary',
    disabled: false,
    onPress: jest.fn(),
    icon: 'calendar',
    ...overrides,
  };
}

beforeEach(() => {
  mockWindowDimensions.width = 390;
  mockWindowDimensions.height = 844;
});

describe('PaywallPlanGrid', () => {
  it('renders a half-width pair (monthly + yearly) and a full-width lifetime hero at phone width', () => {
    const { getByTestId } = render(
      <PaywallPlanGrid
        plans={[
          plan({ id: 'monthly', title: 'Monthly' }),
          plan({ id: 'yearly', title: 'Yearly' }),
          plan({ id: 'lifetime', title: 'Lifetime' }),
        ]}
      />,
    );
    // usable = 390 - 40 = 350; pairW = (350 - 12) / 2 = 169.
    expect(getByTestId('paywall.plan.monthly').props.style.width).toBe(169);
    expect(getByTestId('paywall.plan.yearly').props.style.width).toBe(169);
    expect(getByTestId('paywall.plan.lifetime').props.style.width).toBe(350);
    expect(getByTestId('paywall.plan.lifetime').props.style.flexDirection).toBe('row');
  });

  it('stretches a lone non-hero plan to the full row width', () => {
    const { getByTestId } = render(
      <PaywallPlanGrid
        plans={[
          plan({ id: 'monthly', title: 'Monthly' }),
          plan({ id: 'lifetime', title: 'Lifetime' }),
        ]}
      />,
    );
    expect(getByTestId('paywall.plan.monthly').props.style.width).toBe(350);
    expect(getByTestId('paywall.plan.lifetime').props.style.width).toBe(350);
  });

  it('renders title, price line, and CTA per plan', () => {
    const { getByText, getByTestId } = render(
      <PaywallPlanGrid
        plans={[
          plan({ id: 'monthly', title: 'Monthly', priceLine: '$2.99/month', ctaTestID: 'paywall.monthly.cta' }),
          plan({ id: 'lifetime', title: 'Lifetime', priceLine: '$40.00 one-time', ctaTestID: 'paywall.lifetime.cta' }),
        ]}
      />,
    );
    expect(getByText('Monthly')).toBeTruthy();
    expect(getByText('$2.99/month')).toBeTruthy();
    expect(getByText('Lifetime')).toBeTruthy();
    expect(getByText('$40.00 one-time')).toBeTruthy();
    expect(getByTestId('paywall.monthly.cta')).toBeTruthy();
    expect(getByTestId('paywall.lifetime.cta')).toBeTruthy();
  });

  it('fires onPress when a CTA is pressed', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <PaywallPlanGrid
        plans={[
          plan({ id: 'monthly', title: 'Monthly', ctaTestID: 'paywall.monthly.cta', onPress }),
        ]}
      />,
    );
    fireEvent.press(getByTestId('paywall.monthly.cta'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress for a disabled CTA', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <PaywallPlanGrid
        plans={[
          plan({ id: 'monthly', title: 'Monthly', ctaTestID: 'paywall.monthly.cta', disabled: true, onPress }),
        ]}
      />,
    );
    fireEvent.press(getByTestId('paywall.monthly.cta'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('labels each tile with "title. price" for screen readers', () => {
    const { getByTestId } = render(
      <PaywallPlanGrid
        plans={[
          plan({ id: 'monthly', title: 'Monthly', priceLine: '$2.99/month' }),
          plan({ id: 'lifetime', title: 'Lifetime', priceLine: '$40.00 one-time' }),
        ]}
      />,
    );
    expect(getByTestId('paywall.plan.monthly').props.accessibilityLabel).toBe('Monthly. $2.99/month');
    expect(getByTestId('paywall.plan.lifetime').props.accessibilityLabel).toBe('Lifetime. $40.00 one-time');
  });

  it('renders the per-plan icon badge in every tile', () => {
    const { getByTestId } = render(
      <PaywallPlanGrid
        plans={[
          plan({ id: 'monthly', icon: 'calendar' }),
          plan({ id: 'yearly', icon: 'pricetag' }),
          plan({ id: 'lifetime', icon: 'infinite' }),
        ]}
      />,
    );
    expect(getByTestId('icon-calendar')).toBeTruthy();
    expect(getByTestId('icon-pricetag')).toBeTruthy();
    expect(getByTestId('icon-infinite')).toBeTruthy();
  });
});

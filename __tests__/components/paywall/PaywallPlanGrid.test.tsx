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
  const Button = (props: {
    label?: string;
    onPress?: () => void;
    testID?: string;
    disabled?: boolean;
    style?: Record<string, unknown>;
  }) =>
    React.createElement(
      TouchableOpacity,
      { testID: props.testID, disabled: props.disabled, onPress: props.onPress, style: props.style },
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
  it('renders one plan per full-width row at phone width', () => {
    const { getByTestId } = render(
      <PaywallPlanGrid
        plans={[
          plan({ id: 'monthly', title: 'Monthly' }),
          plan({ id: 'yearly', title: 'Yearly' }),
          plan({ id: 'lifetime', title: 'Lifetime' }),
        ]}
      />,
    );
    // usable = 390 - 40 = 350 — every tile spans the full row.
    expect(getByTestId('paywall.plan.monthly').props.style.width).toBe(350);
    expect(getByTestId('paywall.plan.yearly').props.style.width).toBe(350);
    expect(getByTestId('paywall.plan.lifetime').props.style.width).toBe(350);
    expect(getByTestId('paywall.plan.monthly').props.style.flexDirection).toBe('row');
    expect(getByTestId('paywall.plan.lifetime').props.style.flexDirection).toBe('row');
  });

  it('renders every offered plan as a full-width row regardless of count', () => {
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
          plan({ id: 'monthly', title: 'Monthly', priceLine: '$3.99/month', ctaTestID: 'paywall.monthly.cta' }),
          plan({ id: 'lifetime', title: 'Lifetime', priceLine: '$39.99 one-time', ctaTestID: 'paywall.lifetime.cta' }),
        ]}
      />,
    );
    expect(getByText('Monthly')).toBeTruthy();
    expect(getByText('$3.99/month')).toBeTruthy();
    expect(getByText('Lifetime')).toBeTruthy();
    expect(getByText('$39.99 one-time')).toBeTruthy();
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
          plan({ id: 'monthly', title: 'Monthly', priceLine: '$3.99/month' }),
          plan({ id: 'lifetime', title: 'Lifetime', priceLine: '$39.99 one-time' }),
        ]}
      />,
    );
    expect(getByTestId('paywall.plan.monthly').props.accessibilityLabel).toBe('Monthly. $3.99/month');
    expect(getByTestId('paywall.plan.lifetime').props.accessibilityLabel).toBe('Lifetime. $39.99 one-time');
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

  it('adds a border to secondary CTA buttons but not the primary', () => {
    const { getByTestId } = render(
      <PaywallPlanGrid
        plans={[
          plan({ id: 'monthly', variant: 'primary', ctaTestID: 'paywall.monthly.cta' }),
          plan({ id: 'yearly', variant: 'secondary', ctaTestID: 'paywall.yearly.cta' }),
          plan({ id: 'lifetime', variant: 'secondary', ctaTestID: 'paywall.lifetime.cta' }),
        ]}
      />,
    );
    expect(getByTestId('paywall.monthly.cta').props.style).not.toHaveProperty('borderWidth');
    expect(getByTestId('paywall.yearly.cta').props.style).toEqual(
      expect.objectContaining({ borderWidth: 1, borderColor: '#ddd' }),
    );
    expect(getByTestId('paywall.lifetime.cta').props.style).toEqual(
      expect.objectContaining({ borderWidth: 1, borderColor: '#ddd' }),
    );
  });

  it('lets the price line wrap to two lines instead of truncating', () => {
    const { getByText } = render(
      <PaywallPlanGrid
        plans={[
          plan({
            id: 'monthly',
            priceLine: 'Try 14 days free, then $3.99/month',
            ctaTestID: 'paywall.monthly.cta',
          }),
        ]}
      />,
    );
    const price = getByText('Try 14 days free, then $3.99/month');
    expect(price.props.numberOfLines).toBe(2);
    expect(price.props.style.lineHeight).toBe(18);
  });
});

import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Surface } from '../ui';
import { useTheme } from '../../contexts/ThemeContext';
import { RADII, SPACING } from '../../theme/tokens';

export interface PlanTileData {
  id: 'monthly' | 'yearly' | 'lifetime';
  title: string;
  priceLine: string | null;
  ctaLabel: string;
  ctaTestID: string;
  variant: 'primary' | 'secondary';
  disabled: boolean;
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
}

const GAP = SPACING[3];
const CARD_PADDING = SPACING[3];
// Screen horizontal margin consumed by the paywall scroll container (20/edge).
const HORIZONTAL_MARGIN = 40;

const ROW = { height: 96, badge: 40, icon: 20, titleSize: 15, priceSize: 13 } as const;

export default function PaywallPlanGrid({ plans }: { plans: PlanTileData[] }) {
  const { width } = useWindowDimensions();

  // One payment method per row — every tile spans the full content width so
  // each plan reads as its own complete choice.
  const usable = width - HORIZONTAL_MARGIN;

  return (
    <View testID="paywall.plans" style={styles.grid}>
      {plans.map((plan) => (
        <PlanTile key={plan.id} plan={plan} width={usable} />
      ))}
    </View>
  );
}

function PlanTile({ plan, width }: { plan: PlanTileData; width: number }) {
  const { colors } = useTheme();

  return (
    <Surface
      testID={`paywall.plan.${plan.id}`}
      elevation="raised"
      radius="md"
      accessibilityLabel={`${plan.title}. ${plan.priceLine ?? ''}`}
      style={{
        width,
        height: ROW.height,
        padding: CARD_PADDING,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING[3],
      }}
    >
      <View
        style={{
          width: ROW.badge,
          height: ROW.badge,
          borderRadius: RADII.sm,
          backgroundColor: colors.primary + '1F',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={plan.icon} size={ROW.icon} color={colors.primary} />
      </View>
      <View style={styles.textBlock}>
        <Text numberOfLines={1} style={{ fontSize: ROW.titleSize, fontWeight: '700', color: colors.text }}>
          {plan.title}
        </Text>
        {plan.priceLine ? (
          <Text numberOfLines={1} style={{ fontSize: ROW.priceSize, color: colors.textSecondary, marginTop: 2 }}>
            {plan.priceLine}
          </Text>
        ) : null}
      </View>
      <Button
        testID={plan.ctaTestID}
        variant={plan.variant}
        disabled={plan.disabled}
        label={plan.ctaLabel}
        onPress={plan.onPress}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: GAP,
  },
  textBlock: {
    flex: 1,
  },
});

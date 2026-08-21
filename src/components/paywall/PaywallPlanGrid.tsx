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

const SMALL = { height: 180, badge: 38, icon: 20, titleSize: 15, priceSize: 13 } as const;
const HERO = { height: 120, badge: 44, icon: 22, titleSize: 17, priceSize: 14 } as const;

export default function PaywallPlanGrid({ plans }: { plans: PlanTileData[] }) {
  const { width } = useWindowDimensions();

  const usable = width - HORIZONTAL_MARGIN;
  const pairW = (usable - GAP) / 2;

  // The lifetime plan is the bento hero (full row); everything before it packs
  // side-by-side. A lone remaining plan stretches to the full row so no row
  // ever dangles a half-empty cell (same rule as the feature grid).
  const hero = plans.find((p) => p.id === 'lifetime');
  const small = plans.filter((p) => p.id !== 'lifetime');
  const smallWidth = small.length === 1 ? usable : pairW;

  return (
    <View testID="paywall.plans" style={styles.grid}>
      {small.map((plan) => (
        <PlanTile key={plan.id} plan={plan} width={smallWidth} size="small" />
      ))}
      {hero ? <PlanTile key={hero.id} plan={hero} width={usable} size="hero" /> : null}
    </View>
  );
}

function PlanTile({
  plan,
  width,
  size,
}: {
  plan: PlanTileData;
  width: number;
  size: 'small' | 'hero';
}) {
  const { colors } = useTheme();
  const m = size === 'hero' ? HERO : SMALL;
  const isHero = size === 'hero';

  return (
    <Surface
      testID={`paywall.plan.${plan.id}`}
      elevation="raised"
      radius="md"
      accessibilityLabel={`${plan.title}. ${plan.priceLine ?? ''}`}
      style={{
        width,
        height: m.height,
        padding: CARD_PADDING,
        backgroundColor: colors.surface,
        flexDirection: isHero ? 'row' : 'column',
        alignItems: isHero ? 'center' : 'flex-start',
        gap: isHero ? SPACING[3] : undefined,
      }}
    >
      <View
        style={{
          width: m.badge,
          height: m.badge,
          borderRadius: RADII.sm,
          backgroundColor: colors.primary + '1F',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: isHero ? 0 : SPACING[2],
        }}
      >
        <Ionicons name={plan.icon} size={m.icon} color={colors.primary} />
      </View>
      <View style={styles.textBlock}>
        <Text numberOfLines={1} style={{ fontSize: m.titleSize, fontWeight: '700', color: colors.text }}>
          {plan.title}
        </Text>
        {plan.priceLine ? (
          <Text numberOfLines={2} style={{ fontSize: m.priceSize, color: colors.textSecondary, marginTop: 2 }}>
            {plan.priceLine}
          </Text>
        ) : null}
      </View>
      <Button
        testID={plan.ctaTestID}
        variant={plan.variant}
        fullWidth={!isHero}
        disabled={plan.disabled}
        label={plan.ctaLabel}
        onPress={plan.onPress}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  textBlock: {
    flex: 1,
  },
});

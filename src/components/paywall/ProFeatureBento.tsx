import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, RADII, TYPE } from '../../theme/tokens';
import { useResponsive } from '../../hooks/useResponsive';

type FeatureKey =
  | 'aiChat'
  | 'aiActions'
  | 'thoughtDump'
  | 'voiceDump'
  | 'personalizedQuotes'
  | 'githubTools'
  | 'canvases'
  | 'templates'
  | 'renderStyles'
  | 'multiAccount';

type IconName = keyof typeof Ionicons.glyphMap;
type FeatureSize = 'small' | 'large';

interface Feature {
  key: FeatureKey;
  icon: IconName;
  size: FeatureSize;
}

// Order mirrors the legacy checklist in PaywallScreen. `personalizedQuotes`
// uses `book-outline` because `quote-outline` is not in the Ionicons glyphmap.
const FEATURES: Feature[] = [
  { key: 'aiChat', icon: 'chatbubbles-outline', size: 'large' },
  { key: 'aiActions', icon: 'sparkles-outline', size: 'small' },
  { key: 'thoughtDump', icon: 'bulb-outline', size: 'small' },
  { key: 'voiceDump', icon: 'mic-outline', size: 'small' },
  { key: 'personalizedQuotes', icon: 'book-outline', size: 'small' },
  { key: 'githubTools', icon: 'logo-github', size: 'small' },
  { key: 'canvases', icon: 'easel-outline', size: 'small' },
  { key: 'templates', icon: 'layers-outline', size: 'small' },
  { key: 'renderStyles', icon: 'color-palette-outline', size: 'small' },
  { key: 'multiAccount', icon: 'people-outline', size: 'small' },
];

const GAP = SPACING[3];

interface PlacedFeature {
  feature: Feature;
  width: number | undefined;
}

// Row-major packing with a column cursor: a tile that does not fit the
// remaining cells of the current row wraps to the next one, and the final
// tile stretches to fill its row when at least two cells are left over.
function placeFeatures(columnCount: number, cardBase: number): PlacedFeature[] {
  const cols = Math.max(1, columnCount);
  let cursor = 0;
  return FEATURES.map((feature, index) => {
    const span = Math.min(feature.size === 'large' ? 2 : 1, cols);
    if (cursor > 0 && cursor + span > cols) {
      cursor = 0;
    }
    const cellsLeft = cols - cursor;
    cursor = (cursor + span) % cols;

    let width: number | undefined;
    if (cardBase > 0) {
      const isLast = index === FEATURES.length - 1;
      const fillsRow = span === cellsLeft;
      if (isLast && !fillsRow && cellsLeft >= 2) {
        width = cellsLeft * cardBase + (cellsLeft - 1) * GAP;
      } else {
        width = span * cardBase + (span - 1) * GAP;
      }
    }
    return { feature, width };
  });
}

// Showcase-only bento grid of the Pro feature list. Cards are deliberately
// non-interactive (plain Views, no onPress); the purchase CTAs live below.
export default function ProFeatureBento() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { columnCount, maxContentWidth, screenWidth } = useResponsive('bento');
  const [measuredWidth, setMeasuredWidth] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setMeasuredWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);

  const containerCap = screenWidth <= maxContentWidth ? screenWidth : maxContentWidth;
  const cardBase =
    measuredWidth > 0
      ? Math.floor((measuredWidth - GAP * (columnCount - 1)) / columnCount)
      : 0;
  const placed = placeFeatures(columnCount, cardBase);

  return (
    <View
      testID="paywall.features"
      onLayout={handleLayout}
      style={[styles.grid, { maxWidth: containerCap, gap: GAP }]}
    >
      {placed.map(({ feature, width }) => {
        const isLarge = feature.size === 'large';
        const title = t(`paywall.features.${feature.key}`);
        const description = t(`paywall.featureDescriptions.${feature.key}`);
        const accent = isLarge ? colors.accent : colors.primary;
        return (
          <View
            key={feature.key}
            testID={`paywall.feature.${feature.key}`}
            accessible
            accessibilityLabel={`${title}. ${description}`}
            style={[
              styles.card,
              {
                width,
                backgroundColor: isLarge ? colors.primary + '14' : colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={[styles.badge, { backgroundColor: accent + '1F' }]}>
              <Ionicons name={feature.icon} size={20} color={accent} />
            </View>
            <Text
              numberOfLines={2}
              style={[styles.title, { color: colors.text, lineHeight: Math.round(TYPE.sm * 1.35) }]}
            >
              {title}
            </Text>
            <Text numberOfLines={3} style={[styles.description, { color: colors.textSecondary }]}>
              {description}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
    marginTop: 6,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADII.md,
    padding: 14,
    overflow: 'hidden',
  },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontWeight: '700',
    fontSize: TYPE.sm,
    marginTop: 10,
  },
  description: {
    fontSize: TYPE.xs,
    lineHeight: 17,
    marginTop: 4,
  },
});

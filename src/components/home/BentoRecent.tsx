import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { BentoTile } from './BentoTile';
import type { RecentItem } from '../../utils/recentItems';

interface Props {
  items: RecentItem[];
  onOpen: (item: RecentItem) => void;
}

/**
 * Bento layout for the Home screen "Recent" feed.
 *
 * Phone (single column logical width):
 *   [        large        ]
 *   [ medium ] [ medium  ]
 *   [ medium ] [ medium  ]
 *   ...
 *
 * Every row after the hero uses the same `medium` tile size so the grid
 * reads as a single uniform block instead of an ad-hoc featured row +
 * smaller follow-ups.
 */
export function BentoRecent({ items, onOpen }: Props) {
  const { colors } = useTheme();
  if (items.length === 0) return null;

  const [first, ...rest] = items;

  const restRows: RecentItem[][] = [];
  for (let i = 0; i < rest.length; i += 2) {
    restRows.push(rest.slice(i, i + 2));
  }

  return (
    <View testID="bento-recent.button.open" style={styles.section}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>Recent</Text>
      <View style={styles.column}>
        <BentoTile item={first} size="large" onPress={() => onOpen(first)} />
        {restRows.map((row, idx) => (
          <View key={`recent-row-${idx}`} style={styles.row}>
            {row.map((item) => (
              <View key={`${item.kind}-${item.data.id}`} style={styles.cell}>
                <BentoTile item={item} size="medium" onPress={() => onOpen(item)} />
              </View>
            ))}
            {row.length === 1 ? <View style={styles.cell} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    marginBottom: 24,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  column: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  cell: {
    flex: 1,
  },
});

export default BentoRecent;

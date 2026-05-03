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
 *   [ small  ] [ small   ]
 *   ...
 *
 * Tablet (wider): the medium and small rows show two tiles per row but
 * each tile is roomier. Layout intent is the same; sizing is taller.
 */
export function BentoRecent({ items, onOpen }: Props) {
  const { colors } = useTheme();
  if (items.length === 0) return null;

  const [first, ...rest] = items;
  const mediums = rest.slice(0, 2);
  const smalls = rest.slice(2);

  const smallRows: RecentItem[][] = [];
  for (let i = 0; i < smalls.length; i += 2) {
    smallRows.push(smalls.slice(i, i + 2));
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>Recent</Text>
      <View style={styles.column}>
        <BentoTile item={first} size="large" onPress={() => onOpen(first)} />
        {mediums.length > 0 ? (
          <View style={styles.row}>
            {mediums.map((item) => (
              <View key={`${item.kind}-${item.data.id}`} style={styles.cell}>
                <BentoTile item={item} size="medium" onPress={() => onOpen(item)} />
              </View>
            ))}
            {mediums.length === 1 ? <View style={styles.cell} /> : null}
          </View>
        ) : null}
        {smallRows.map((row, idx) => (
          <View key={`small-row-${idx}`} style={styles.row}>
            {row.map((item) => (
              <View key={`${item.kind}-${item.data.id}`} style={styles.cell}>
                <BentoTile item={item} size="small" onPress={() => onOpen(item)} />
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
    marginBottom: 16,
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

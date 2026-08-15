import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { BentoTile } from './BentoTile';
import type { RecentItem } from '../../utils/recentItems';
import { useResponsive } from '../../hooks/useResponsive';

interface Props {
  items: RecentItem[];
  onOpen: (item: RecentItem) => void;
  onLongPress?: (item: RecentItem) => void;
  lockedIds?: Set<string>;
}

export function BentoRecent({ items, onOpen, onLongPress, lockedIds }: Props) {
  const { colors } = useTheme();
  const { columnCount } = useResponsive('bento');

  if (items.length === 0) return null;

  const rows: RecentItem[][] = [];
  for (let i = 0; i < items.length; i += columnCount) {
    rows.push(items.slice(i, i + columnCount));
  }

  return (
    <View testID="bento-recent.button.open" style={styles.section}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>Recent</Text>
      <View style={styles.column}>
        {rows.map((row, rowIdx) => (
          <View key={`recent-row-${rowIdx}`} style={styles.row}>
            {row.map((item, colIdx) => {
              const flatIdx = rowIdx * columnCount + colIdx;
              return (
                <View key={`${item.kind}-${item.data.id}`} style={styles.cell}>
                  <BentoTile
                    item={item}
                    size="medium"
                    onPress={() => onOpen(item)}
                    onLongPress={onLongPress ? () => onLongPress(item) : undefined}
                    locked={lockedIds?.has(item.data.id)}
                    testIDSlot={`recent-${flatIdx}`}
                  />
                </View>
              );
            })}
            {row.length < columnCount
              ? Array.from({ length: columnCount - row.length }).map((_, idx) => (
                  <View key={`placeholder-${idx}`} style={styles.cell} />
                ))
              : null}
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

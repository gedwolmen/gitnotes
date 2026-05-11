import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { RecentItem } from '../../utils/recentItems';
import { BentoTile } from './BentoTile';

interface Props {
  items: RecentItem[];
  onOpen: (item: RecentItem) => void;
}

const CARD_WIDTH = 176;
const EDGE_INSET = 20;

export function QuickAccessShelf({ items, onOpen }: Props) {
  const { colors } = useTheme();
  if (items.length === 0) return null;

  return (
    <View testID="quick-access-shelf.button.open" style={styles.section}>
      <View style={styles.headerRow}>
        <Ionicons name="pin" size={14} color={colors.textSecondary} />
        <Text style={[styles.heading, { color: colors.textSecondary }]}>Quick access</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((item, idx) => (
          <BentoTile
            key={`${item.kind}-${item.data.id}`}
            item={item}
            size="medium"
            widthOverride={CARD_WIDTH}
            hidePinGlyph
            onPress={() => onOpen(item)}
            testIDSlot={`pinned-${idx}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 4,
    marginBottom: 16,
    marginHorizontal: -EDGE_INSET,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingLeft: EDGE_INSET + 4,
    paddingRight: EDGE_INSET + 4,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    gap: 12,
    paddingLeft: EDGE_INSET,
    paddingRight: EDGE_INSET,
  },
});

export default QuickAccessShelf;

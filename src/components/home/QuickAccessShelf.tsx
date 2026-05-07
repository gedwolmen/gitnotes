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
        {items.map((item) => (
          <BentoTile
            key={`${item.kind}-${item.data.id}`}
            item={item}
            size="medium"
            widthOverride={CARD_WIDTH}
            hidePinGlyph
            onPress={() => onOpen(item)}
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
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    gap: 12,
    paddingRight: 12,
  },
});

export default QuickAccessShelf;

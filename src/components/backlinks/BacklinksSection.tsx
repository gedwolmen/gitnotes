import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useBacklinks } from '../../contexts/BacklinksContext';
import { useTokens } from '../../contexts/ThemeContext';
import { BacklinkItem } from './BacklinkItem';

interface BacklinksSectionProps {
  noteId: string;
  onNavigateToNote: (noteId: string) => void;
}

export function BacklinksSection({ noteId, onNavigateToNote }: BacklinksSectionProps) {
  const { getBacklinks } = useBacklinks();
  const { spacing, type } = useTokens();
  const backlinks = getBacklinks(noteId);

  if (backlinks.length === 0) {
    return null;
  }

  return (
    <View testID="note-viewer.button.navigate-note" style={[styles.container, { marginTop: spacing[4], paddingHorizontal: spacing[4] }]}>
      <Text
        accessibilityRole="text"
        style={[styles.header, { fontSize: type.md, fontWeight: '700', marginBottom: spacing[2] }]}
      >
        Backlinks ({backlinks.length})
      </Text>
      {backlinks.map((bl, i) => (
        <BacklinkItem
          key={bl.sourceNoteId + i}
          title={bl.sourceNoteTitle || bl.sourceNoteId}
          snippet={bl.snippet}
          onPress={() => onNavigateToNote(bl.sourceNoteId)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  header: {},
});

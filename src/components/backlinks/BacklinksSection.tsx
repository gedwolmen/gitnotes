import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useBacklinks } from '../../contexts/BacklinksContext';
import { BacklinkItem } from './BacklinkItem';

interface BacklinksSectionProps {
  noteId: string;
  onNavigateToNote: (noteId: string) => void;
}

export function BacklinksSection({ noteId, onNavigateToNote }: BacklinksSectionProps) {
  const { getBacklinks } = useBacklinks();
  const backlinks = getBacklinks(noteId);

  if (backlinks.length === 0) {
    return null;
  }

  return (
    <View testID="note-viewer.button.navigate-note" style={styles.container}>
      <Text style={styles.header}>Backlinks ({backlinks.length})</Text>
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
  container: { marginTop: 16, paddingHorizontal: 16 },
  header: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
});

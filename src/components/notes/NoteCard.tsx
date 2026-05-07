import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { Note } from '../../models/Note';
import { ViewMode } from '../../utils/viewModes';
import { useTheme } from '../../contexts/ThemeContext';
import BaseNoteCard from '../NoteCard';

interface NotesNoteCardProps {
  note: Note;
  viewMode: ViewMode;
  onPress: (note: Note) => void;
  onLongPress: (note: Note) => void;
  highlighted: boolean;
  isOffline: boolean;
  isCached: boolean;
  onTagPress?: (tag: string) => void;
}

function NotesNoteCardImpl({
  note,
  viewMode,
  onPress,
  onLongPress,
  highlighted,
  isOffline,
  isCached,
  onTagPress,
}: NotesNoteCardProps) {
  const { colors } = useTheme();

  const content = (
    <View testID="notes-list-card.button.press" {...({ note } as { note: Note })}>
      <BaseNoteCard
        note={note}
        onPress={onPress}
        onLongPress={onLongPress}
        highlighted={highlighted}
        isOffline={isOffline}
        isCached={isCached}
        onTagPress={onTagPress}
      />
    </View>
  );

  return (
    <View testID="note-card-root.button.press">
      {viewMode === 'journal' ? (
        <View {...({ note } as { note: Note })} style={styles.journalItem}>
          <Text style={[styles.journalDate, { color: colors.textSecondary }]}>
            {note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : ''}
          </Text>
          {content}
        </View>
      ) : (
        content
      )}
    </View>
  );
}

export const NoteCard = memo(NotesNoteCardImpl, (prev, next) => {
  return (
    prev.note === next.note &&
    prev.viewMode === next.viewMode &&
    prev.highlighted === next.highlighted &&
    prev.isOffline === next.isOffline &&
    prev.isCached === next.isCached &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress &&
    prev.onTagPress === next.onTagPress
  );
});

const styles = StyleSheet.create({
  journalItem: { marginBottom: 8 },
  journalDate: { fontSize: 12, marginBottom: 4, marginLeft: 4 },
});

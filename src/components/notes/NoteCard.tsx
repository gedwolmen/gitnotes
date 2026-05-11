import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { Note } from '../../models/Note';
import { ViewMode } from '../../utils/viewModes';
import { useTheme } from '../../contexts/ThemeContext';
import { formatJournalDate } from '../../services/JournalService';
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
  /** Date key (yyyy-MM-dd) of the previous note in the list, used by journal view to group entries under one header per day. */
  prevDateKey?: string;
  /** Render-order index from the parent list — used for the canonical card testID so Maestro can target stable slots. */
  index: number;
}

function journalDateKey(timestamp: number | undefined): string {
  if (!timestamp) return '';
  return formatJournalDate(new Date(timestamp));
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
  prevDateKey,
  index,
}: NotesNoteCardProps) {
  const { colors } = useTheme();

  const content = (
    <View testID={`notes-list.button.press-card-${index}`} {...({ note } as { note: Note })}>
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

  if (viewMode === 'journal') {
    const currentDateKey = journalDateKey(note.updatedAt);
    const showDate = currentDateKey !== '' && currentDateKey !== prevDateKey;
    return (
      <View {...({ note } as { note: Note })} style={styles.journalItem}>
        {showDate ? (
          <Text style={[styles.journalDate, { color: colors.textSecondary }]}>{currentDateKey}</Text>
        ) : null}
        {content}
      </View>
    );
  }

  return content;
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
    prev.onTagPress === next.onTagPress &&
    prev.prevDateKey === next.prevDateKey &&
    prev.index === next.index
  );
});

const styles = StyleSheet.create({
  journalItem: { marginBottom: 8 },
  journalDate: { fontSize: 12, marginBottom: 4, marginLeft: 4 },
});

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Note } from '../../models/Note';
import { ViewMode } from '../../utils/viewModes';
import { useTheme } from '../../contexts/ThemeContext';
import BaseNoteCard from '../NoteCard';
import { NotesSwipeActions } from './NotesSwipeActions';

interface NotesNoteCardProps {
  note: Note;
  viewMode: ViewMode;
  swipeableRef: React.RefObject<SwipeableMethods | null>;
  onSwipeableWillOpen: () => void;
  onSwipeableWillClose: () => void;
  onDelete: () => void;
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
  swipeableRef,
  onSwipeableWillOpen,
  onSwipeableWillClose,
  onDelete,
  onPress,
  onLongPress,
  highlighted,
  isOffline,
  isCached,
  onTagPress,
}: NotesNoteCardProps) {
  const { colors } = useTheme();

  const content = (
    <BaseNoteCard
      note={note}
      onPress={onPress}
      onLongPress={onLongPress}
      highlighted={highlighted}
      isOffline={isOffline}
      isCached={isCached}
      onTagPress={onTagPress}
    />
  );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      overshootRight={false}
      rightThreshold={40}
      onSwipeableWillOpen={onSwipeableWillOpen}
      onSwipeableWillClose={onSwipeableWillClose}
      renderRightActions={() => <NotesSwipeActions onDelete={onDelete} />}
    >
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
    </ReanimatedSwipeable>
  );
}

export const NoteCard = memo(NotesNoteCardImpl, (prev, next) => {
  return (
    prev.note === next.note &&
    prev.viewMode === next.viewMode &&
    prev.highlighted === next.highlighted &&
    prev.isOffline === next.isOffline &&
    prev.isCached === next.isCached &&
    prev.swipeableRef === next.swipeableRef &&
    prev.onSwipeableWillOpen === next.onSwipeableWillOpen &&
    prev.onSwipeableWillClose === next.onSwipeableWillClose &&
    prev.onDelete === next.onDelete &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress &&
    prev.onTagPress === next.onTagPress
  );
});

const styles = StyleSheet.create({
  journalItem: { marginBottom: 8 },
  journalDate: { fontSize: 12, marginBottom: 4, marginLeft: 4 },
});

import { useCallback } from 'react';
import { Alert } from 'react-native';

import { RootStackParamList } from '../../navigation/types';
import { Note, NoteColor } from '../../models/Note';
import { parseRepoPath } from '../../utils/gitPathParser';
import { HapticService } from '../../utils/haptics';
import { ShareFormat, ShareService } from '../../services/ShareService';
import { githubActivity } from '../../stores/githubActivityStore';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface UseNotesListNoteActionsArgs {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  isConnected: boolean | null;
  closeOpenSwipeable: () => void;
  createNote: (input: {
    title: string;
    content: string;
    tags?: string[];
    repo?: string;
    branch?: string;
    folderPath?: string;
    format?: Note['format'];
    attachments?: Note['attachments'];
  }) => Promise<Note | null>;
  updateNote: (input: { id: string; color?: NoteColor | null; content?: string }) => Promise<Note | null>;
  deleteNote: (id: string) => Promise<boolean>;
  togglePin: (id: string) => Promise<boolean>;
  setLongPressedNote: (note: Note | null) => void;
  setColorPickerNote: (note: Note | null) => void;
  setIsDeleting: (value: boolean) => void;
}

export function useNotesListNoteActions({
  navigation,
  isConnected,
  closeOpenSwipeable,
  createNote,
  updateNote,
  deleteNote,
  togglePin,
  setLongPressedNote,
  setColorPickerNote,
  setIsDeleting,
}: UseNotesListNoteActionsArgs) {
  const handleNotePress = useCallback(
    (note: Note) => {
      if (isConnected === false && !note.content?.trim()) {
        Alert.alert('Not available offline');
        return;
      }
      if (note.format === 'pdf' && note.repo && note.filePath) {
        const info = parseRepoPath(note.repo);
        if (info) {
          navigation.navigate('PdfViewer', {
            owner: info.owner,
            repo: info.repo,
            branch: note.branch,
            path: note.filePath,
            title: note.title,
          });
          return;
        }
      }
      navigation.navigate('NoteEditor', { noteId: note.id });
    },
    [isConnected, navigation],
  );

  const handleColorSelect = useCallback(
    async (note: Note | null, color: NoteColor | null) => {
      if (!note) return;
      try {
        const updated = await updateNote({ id: note.id, color });
        if (!updated) {
          HapticService.error();
          Alert.alert('Error', 'Failed to update note color');
          return;
        }
        HapticService.success();

      } catch {
        HapticService.error();
        Alert.alert('Error', 'Failed to update note color');
      }
    },
    [updateNote],
  );

  const handleDeleteNote = useCallback(
    async (note: Note) => {
      githubActivity.begin('Deleting note');
      setIsDeleting(true);
      try {
        if (!(await deleteNote(note.id))) {
          Alert.alert('Error', 'Failed to delete note');
          return false;
        }
        setLongPressedNote(null);
        HapticService.success();
        return true;
      } catch (error) {
        console.warn('[useNotesListNoteActions] deleteNote failed:', error);
        Alert.alert('Error', 'Failed to delete note');
        return false;
      } finally {
        githubActivity.end();
        setIsDeleting(false);
      }
    },
    [deleteNote, setIsDeleting, setLongPressedNote],
  );

  const handleDeleteFromSwipe = useCallback(
    (note: Note) => {
      closeOpenSwipeable();
      Alert.alert('Delete Note', `Delete "${note.title || 'Untitled'}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => void (await handleDeleteNote(note)) },
      ]);
    },
    [closeOpenSwipeable, handleDeleteNote],
  );

  const handleNoteLongPress = useCallback((note: Note) => {
    HapticService.medium();
    setLongPressedNote(note);
  }, [setLongPressedNote]);

  const handleTogglePin = useCallback(
    async (note: Note) => {
      if (!(await togglePin(note.id))) Alert.alert('Error', 'Failed to update pin status');
    },
    [togglePin],
  );

  const handleExport = useCallback(async (note: Note, format: ShareFormat) => {
    try {
      const ok = await ShareService.shareInFormat(note, format);
      if (!ok) {
        Alert.alert('Error', 'Failed to export note');
      }
    } catch (error) {
      console.error('[useNotesListNoteActions] Share/export error:', error);
      Alert.alert('Error', 'Failed to export note');
    }
  }, []);

  const handleOpenColorPicker = useCallback((note: Note) => {
    setLongPressedNote(null);
    setColorPickerNote(note);
  }, [setColorPickerNote, setLongPressedNote]);

  const handleDuplicate = useCallback(
    async (note: Note) => {
      const created = await createNote({
        title: `${note.title || 'Untitled'} (copy)`,
        content: note.content ?? '',
        tags: note.tags ? [...note.tags] : undefined,
        repo: note.repo,
        branch: note.branch,
        folderPath: note.folderPath,
        format: note.format,
        attachments: note.attachments ? [...note.attachments] : undefined,
      });
      if (created) {
        HapticService.success();
      } else {
        HapticService.error();
        Alert.alert('Error', 'Failed to duplicate note');
      }
    },
    [createNote],
  );

  return {
    handleNotePress,
    handleColorSelect,
    handleDeleteNote,
    handleDeleteFromSwipe,
    handleNoteLongPress,
    handleTogglePin,
    handleExport,
    handleOpenColorPicker,
    handleDuplicate,
  };
}

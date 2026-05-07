import React from 'react';
import { View } from 'react-native';

import ContextMenu from '../ContextMenu';
import { Note } from '../../models/Note';

interface NotesContextMenuProps {
  note: Note | null;
  visible: boolean;
  onClose: () => void;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => Promise<void>;
  onShare: (note: Note) => Promise<void>;
  onPickColor: (note: Note) => void;
  onDuplicate: (note: Note) => Promise<void>;
  onDelete: (note: Note) => Promise<void>;
}

export function NotesContextMenu({
  note,
  visible,
  onClose,
  onOpen,
  onTogglePin,
  onShare,
  onPickColor,
  onDuplicate,
  onDelete,
}: NotesContextMenuProps) {
  return (
    <View testID="notes-context-menu.item.close">
      <ContextMenu
      visible={visible}
      onClose={onClose}
      title={note?.title || 'Untitled'}
      subtitle={note?.filePath ?? undefined}
      headerIcon={note?.format === 'pdf' ? 'document' : 'document-text'}
      sections={
        note
          ? [
              {
                items: [
                  {
                    icon: 'eye-outline',
                    label: 'Open',
                    testID: 'notes-context-menu.item.open',
                    onPress: () => onOpen(note),
                  },
                  {
                    icon: note.isPinned ? 'pin' : 'pin-outline',
                    label: note.isPinned ? 'Unpin' : 'Pin',
                    testID: 'notes-context-menu.item.toggle-pin',
                    onPress: async () => onTogglePin(note),
                  },
                  {
                    icon: 'share-outline',
                    label: 'Share / Save',
                    testID: 'notes-context-menu.item.share',
                    onPress: async () => onShare(note),
                  },
                  {
                    icon: 'color-palette-outline',
                    label: 'Color',
                    testID: 'notes-context-menu.item.pick-color',
                    onPress: () => onPickColor(note),
                  },
                  {
                    icon: 'copy-outline',
                    label: 'Duplicate',
                    testID: 'notes-context-menu.item.duplicate',
                    onPress: async () => onDuplicate(note),
                  },
                ],
              },
              {
                items: [
                  {
                    icon: 'trash-outline',
                    label: 'Delete',
                    destructive: true,
                    testID: 'notes-context-menu.item.delete',
                    onPress: async () => onDelete(note),
                  },
                ],
              },
            ]
          : []
      }
    />
    </View>
  );
}

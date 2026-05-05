import React from 'react';

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
                    onPress: () => onOpen(note),
                  },
                  {
                    icon: note.isPinned ? 'pin' : 'pin-outline',
                    label: note.isPinned ? 'Unpin' : 'Pin',
                    onPress: async () => onTogglePin(note),
                  },
                  {
                    icon: 'share-outline',
                    label: 'Share / Save',
                    onPress: async () => onShare(note),
                  },
                  {
                    icon: 'color-palette-outline',
                    label: 'Color',
                    onPress: () => onPickColor(note),
                  },
                  {
                    icon: 'copy-outline',
                    label: 'Duplicate',
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
                    onPress: async () => onDelete(note),
                  },
                ],
              },
            ]
          : []
      }
    />
  );
}

import React from 'react';
import { View } from 'react-native';

import ContextMenu from '../ContextMenu';
import { Note } from '../../models/Note';
import { ShareFormat, ShareService } from '../../services/ShareService';

const EXPORT_LABELS: Record<ShareFormat, string> = {
  pdf: 'PDF',
  docx: 'Word / DOCX',
  markdown: 'Markdown',
  text: 'Plain Text',
  org: 'Org Mode',
  neorg: 'Neorg',
};

const EXPORT_ICONS: Record<ShareFormat, 'document-outline' | 'document-text-outline'> = {
  pdf: 'document-outline',
  docx: 'document-outline',
  markdown: 'document-text-outline',
  text: 'document-text-outline',
  org: 'document-text-outline',
  neorg: 'document-text-outline',
};

interface NotesContextMenuProps {
  note: Note | null;
  visible: boolean;
  onClose: () => void;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => Promise<void>;
  onShare: (note: Note, format: ShareFormat) => Promise<void>;
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
  const [exportPickerNote, setExportPickerNote] = React.useState<Note | null>(null);

  const exportOptions = exportPickerNote ? ShareService.getAvailableFormats(exportPickerNote) : [];

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
                      subtitle: 'Choose export format',
                      testID: 'notes-context-menu.item.share',
                      onPress: () => setExportPickerNote(note),
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
      <ContextMenu
        visible={exportPickerNote !== null}
        onClose={() => setExportPickerNote(null)}
        title="Share / Save"
        subtitle={exportPickerNote?.title || 'Untitled'}
        headerIcon="share-outline"
        sections={
          exportPickerNote
            ? [
                {
                  items: exportOptions.map((format) => ({
                    icon: EXPORT_ICONS[format],
                    label: EXPORT_LABELS[format],
                    testID: `notes-context-menu.export.${format}`,
                    onPress: async () => {
                      const currentNote = exportPickerNote;
                      setExportPickerNote(null);
                      await onShare(currentNote, format);
                    },
                  })),
                },
              ]
            : []
        }
      />
    </View>
  );
}

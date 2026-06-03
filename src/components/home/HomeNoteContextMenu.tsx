import React from 'react';
import { View } from 'react-native';

import ContextMenu from '../ContextMenu';
import { Note } from '../../models/Note';
import { ShareFormat, ShareService } from '../../services/ShareService';
import type { RecentItem } from '../../utils/recentItems';

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

interface HomeNoteContextMenuProps {
  item: RecentItem | null;
  visible: boolean;
  onClose: () => void;
  onOpen: (item: RecentItem) => void;
  onTogglePin?: (item: RecentItem) => Promise<void>;
  onShare?: (note: Note, format: ShareFormat) => Promise<void>;
  onPickColor?: (item: RecentItem) => void;
  onDuplicate?: (item: RecentItem) => Promise<void>;
  onDelete?: (item: RecentItem) => Promise<void>;
}

export function HomeNoteContextMenu({
  item,
  visible,
  onClose,
  onOpen,
  onTogglePin,
  onShare,
  onPickColor,
  onDuplicate,
  onDelete,
}: HomeNoteContextMenuProps) {
  const [exportPickerItem, setExportPickerItem] = React.useState<RecentItem | null>(null);

  const note = item?.kind === 'note' || item?.kind === 'document' ? item.data : null;
  const exportOptions = note ? ShareService.getAvailableFormats(note) : [];

  const handleTogglePin = () => {
    if (item && onTogglePin) {
      onTogglePin(item);
    }
    onClose();
  };

  const handleShare = () => {
    if (note) {
      setExportPickerItem(item);
    }
  };

  const handlePickColor = () => {
    if (item && onPickColor) {
      onPickColor(item);
    }
    onClose();
  };

  const handleDuplicate = async () => {
    if (item && onDuplicate) {
      await onDuplicate(item);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (item && onDelete) {
      await onDelete(item);
    }
    onClose();
  };

  return (
    <View testID="home-note-context-menu.item.close">
      <ContextMenu
        visible={visible}
        onClose={onClose}
        title={item?.data.title || 'Untitled'}
        subtitle={item?.kind === 'document' ? (item.data as Note).filePath ?? undefined : undefined}
        headerIcon={item?.kind === 'document' ? 'document' : item?.kind === 'canvas' ? 'easel' : 'document-text'}
        sections={
          item
            ? [
                {
                  items: [
                    {
                      icon: 'eye-outline',
                      label: 'Open',
                      testID: 'home-note-context-menu.item.open',
                      onPress: () => onOpen(item),
                    },
                    ...(onTogglePin
                      ? [
                          {
                            icon: item.pinned ? 'pin' : 'pin-outline',
                            label: item.pinned ? 'Unpin' : 'Pin',
                            testID: 'home-note-context-menu.item.toggle-pin',
                            onPress: handleTogglePin,
                          },
                        ]
                      : []),
                    ...(onShare && note
                      ? [
                          {
                            icon: 'share-outline',
                            label: 'Share / Save',
                            subtitle: 'Choose export format',
                            testID: 'home-note-context-menu.item.share',
                            onPress: handleShare,
                          },
                        ]
                      : []),
                    ...(onPickColor && item.kind !== 'canvas'
                      ? [
                          {
                            icon: 'color-palette-outline',
                            label: 'Color',
                            testID: 'home-note-context-menu.item.pick-color',
                            onPress: handlePickColor,
                          },
                        ]
                      : []),
                    ...(onDuplicate
                      ? [
                          {
                            icon: 'copy-outline',
                            label: 'Duplicate',
                            testID: 'home-note-context-menu.item.duplicate',
                            onPress: handleDuplicate,
                          },
                        ]
                      : []),
                  ],
                },
                ...(onDelete
                  ? [
                      {
                        items: [
                          {
                            icon: 'trash-outline',
                            label: 'Delete',
                            destructive: true,
                            testID: 'home-note-context-menu.item.delete',
                            onPress: handleDelete,
                          },
                        ],
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
      <ContextMenu
        visible={exportPickerItem !== null}
        onClose={() => setExportPickerItem(null)}
        title="Share / Save"
        subtitle={exportPickerItem?.data.title || 'Untitled'}
        headerIcon="share-outline"
        sections={
          exportPickerItem
            ? [
                {
                  items: exportOptions.map((format) => ({
                    icon: EXPORT_ICONS[format],
                    label: EXPORT_LABELS[format],
                    testID: `home-note-context-menu.export.${format}`,
                    onPress: async () => {
                      const currentNote = exportPickerItem?.kind === 'note' || exportPickerItem?.kind === 'document'
                        ? exportPickerItem.data
                        : null;
                      setExportPickerItem(null);
                      if (currentNote && onShare) {
                        await onShare(currentNote, format);
                      }
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
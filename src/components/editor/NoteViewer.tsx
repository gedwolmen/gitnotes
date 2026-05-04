import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../contexts/ThemeContext';
import { TocEntry } from './editorShared';
import { HapticService } from '../../utils/haptics';
import { IconButton, Modal } from '../ui';
import { NotePreviewPane } from './NotePreviewPane';
import { NoteFormat } from '../../models/Note';

interface NoteViewerProps {
  noteFormat: NoteFormat;
  canEdit: boolean;
  canSpeak: boolean;
  isSpeaking: boolean;
  tocEntries: TocEntry[];
  showToc: boolean;
  onBack: () => void;
  onToggleToc: () => void;
  onToggleSpeak: () => void;
  onEdit: () => void;
  onCloseToc: () => void;
  onTocPress: (entry: TocEntry) => void;
  previewContent: string;
  parsedStructuredContent: unknown[] | null;
  markdownStyles: any;
  notePreviewRenderer: any;
  pdfViewerUri: string;
  authToken?: string | null;
  pdfLoadError: { uri: string; message: string } | null;
  onPdfError: (message: string) => void;
  previewScrollRef: React.RefObject<ScrollView | null>;
  onPreviewScroll: (event: any) => void;
  onPreviewContentSizeChange: () => void;
}

export function NoteViewer({
  noteFormat,
  canEdit,
  canSpeak,
  isSpeaking,
  tocEntries,
  showToc,
  onBack,
  onToggleToc,
  onToggleSpeak,
  onEdit,
  onCloseToc,
  onTocPress,
  previewContent,
  parsedStructuredContent,
  markdownStyles,
  notePreviewRenderer,
  pdfViewerUri,
  authToken,
  pdfLoadError,
  onPdfError,
  previewScrollRef,
  onPreviewScroll,
  onPreviewContentSizeChange,
}: NoteViewerProps) {
  const { colors } = useTheme();
  const isPdfNote = noteFormat === 'pdf';

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface, gap: 8 }]}>
        <IconButton size="sm" onPress={onBack} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={colors.accent} />
        </IconButton>
        <View style={styles.flex} />

        {!isPdfNote && tocEntries.length > 0 ? (
          <IconButton
            size="sm"
            onPress={() => {
              HapticService.light();
              onToggleToc();
            }}
            accessibilityLabel="Table of contents"
          >
            <Ionicons name="list" size={18} color={colors.accent} />
          </IconButton>
        ) : null}

        {!isPdfNote && canSpeak ? (
          <IconButton size="sm" onPress={onToggleSpeak} accessibilityLabel="Read aloud">
            <Ionicons name={isSpeaking ? 'stop-circle' : 'volume-high'} size={18} color={colors.accent} />
          </IconButton>
        ) : null}

        {canEdit ? (
          <IconButton
            size="sm"
            onPress={() => {
              HapticService.light();
              onEdit();
            }}
            accessibilityLabel="Edit"
          >
            <Ionicons name="pencil" size={18} color={colors.accent} />
          </IconButton>
        ) : null}
      </View>

      <NotePreviewPane
        noteFormat={noteFormat}
        previewContent={previewContent}
        parsedStructuredContent={parsedStructuredContent}
        markdownStyles={markdownStyles}
        notePreviewRenderer={notePreviewRenderer}
        pdfViewerUri={pdfViewerUri}
        authToken={authToken}
        pdfLoadError={pdfLoadError}
        onPdfError={onPdfError}
        previewScrollRef={previewScrollRef}
        onScroll={onPreviewScroll}
        onContentSizeChange={onPreviewContentSizeChange}
      />

      <Modal visible={showToc} onRequestClose={onCloseToc} fullWidth>
        <Text style={[styles.tocTitle, { color: colors.text }]}>Table of contents</Text>
        {tocEntries.length === 0 ? (
          <Text style={{ color: colors.textSecondary }}>No headings in this note.</Text>
        ) : (
          <ScrollView style={{ maxHeight: 360 }}>
            {tocEntries.map((entry, index) => (
              <TouchableOpacity
                key={`${entry.lineIndex}-${index}`}
                onPress={() => onTocPress(entry)}
                style={[styles.tocRow, { paddingLeft: 8 + (entry.level - 1) * 14 }]}
              >
                <Text
                  style={[
                    styles.tocText,
                    {
                      color: colors.text,
                      fontWeight: entry.level <= 2 ? '600' : '400',
                      fontSize: entry.level === 1 ? 16 : 14,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {entry.text}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity onPress={onCloseToc} style={styles.tocClose}>
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Close</Text>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tocTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  tocRow: { paddingVertical: 8 },
  tocText: { fontSize: 14 },
  tocClose: { paddingTop: 12, alignItems: 'flex-end' },
});

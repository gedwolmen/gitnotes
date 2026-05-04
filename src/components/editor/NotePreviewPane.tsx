import React from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { NoteFormat } from '../../models/Note';
import NeorgRenderer from '../NeorgRenderer';
import PdfViewer from '../PdfViewer';
import { MarkdownBody } from './MarkdownBody';

interface NotePreviewPaneProps {
  noteFormat: NoteFormat;
  previewContent: string;
  parsedStructuredContent: unknown[] | null;
  markdownStyles: any;
  notePreviewRenderer: any;
  pdfViewerUri: string;
  authToken?: string | null;
  pdfLoadError: { uri: string; message: string } | null;
  onPdfError: (message: string) => void;
  previewScrollRef?: React.RefObject<ScrollView | null>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange?: () => void;
  showLivePreviewLabel?: boolean;
  bordered?: boolean;
}

export function NotePreviewPane({
  noteFormat,
  previewContent,
  parsedStructuredContent,
  markdownStyles,
  notePreviewRenderer,
  pdfViewerUri,
  authToken,
  pdfLoadError,
  onPdfError,
  previewScrollRef,
  onScroll,
  onContentSizeChange,
  showLivePreviewLabel = false,
  bordered = false,
}: NotePreviewPaneProps) {
  const { colors } = useTheme();

  if (noteFormat === 'pdf') {
    return (
      <View style={styles.pdfFullScreenContainer}>
        {previewContent.trim() ? (
          pdfViewerUri ? (
            <PdfViewer uri={pdfViewerUri} token={authToken ?? undefined} style={styles.pdfViewer} onError={onPdfError} />
          ) : (
            <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}>No PDF URL available for this note.</Text>
          )
        ) : (
          <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}>No PDF URL available for this note.</Text>
        )}
        {pdfLoadError && pdfViewerUri && pdfLoadError.uri === pdfViewerUri ? (
          <Text style={[styles.pdfErrorText, { color: colors.error }]}>Failed to load PDF: {pdfLoadError.message}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView
      ref={previewScrollRef}
      style={[styles.scrollView, bordered && { borderLeftColor: colors.border, borderLeftWidth: StyleSheet.hairlineWidth }]}
      contentContainerStyle={styles.previewContent}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
      onScroll={onScroll}
      scrollEventThrottle={200}
      onContentSizeChange={onContentSizeChange}
    >
      {showLivePreviewLabel ? <Text style={[styles.livePreviewLabel, { color: colors.textSecondary }]}>Preview</Text> : null}
      {previewContent.trim() ? (
        noteFormat === 'markdown' ? (
          <MarkdownBody value={previewContent} styles={markdownStyles} renderer={notePreviewRenderer} />
        ) : parsedStructuredContent ? (
          <NeorgRenderer blocks={parsedStructuredContent as never} format={noteFormat === 'org' ? 'org' : 'neorg'} />
        ) : (
          <Text style={[styles.structuredFallback, { color: colors.text }]}>{previewContent}</Text>
        )
      ) : (
        <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}> 
          {showLivePreviewLabel ? 'Start writing to see a preview...' : 'No content — tap the pencil to start writing.'}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  previewContent: {
    padding: 20,
    paddingTop: 28,
    paddingBottom: 60,
  },
  emptyPreview: {
    fontSize: 16,
    fontStyle: 'italic',
    marginTop: 8,
  },
  structuredFallback: {
    fontSize: 16,
    lineHeight: 24,
  },
  pdfFullScreenContainer: {
    flex: 1,
  },
  pdfViewer: {
    flex: 1,
    width: '100%',
  },
  pdfErrorText: {
    fontSize: 13,
    marginTop: 8,
    marginHorizontal: 12,
    textAlign: 'center',
  },
  livePreviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
});

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { useTheme } from '../../contexts/ThemeContext';
import { NoteFormat } from '../../models/Note';
import StructuredRenderer from '../StructuredRenderer';
import CanvasPreview from '../CanvasPreview';
import PdfViewer from '../PdfViewer';
import { MarkdownBody } from './MarkdownBody';

// Notes longer than this defer markdown parsing one frame so the loading
// overlay can paint before the JS thread is blocked. Short notes parse
// inline and skip the overlay so we don't add a perceptible flash.
const DEFERRED_PARSE_THRESHOLD_CHARS = 4000;

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
  onOpenNote?: (path: string, fragment?: string) => boolean;
  currentNotePath?: string;
  headingPositions?: { current: Map<string, number> };
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
  onOpenNote,
  currentNotePath,
  headingPositions,
  previewScrollRef,
  onScroll,
  onContentSizeChange,
  showLivePreviewLabel = false,
  bordered = false,
}: NotePreviewPaneProps) {
  const { colors, isDark } = useTheme();
  const isHeavy = previewContent.length > DEFERRED_PARSE_THRESHOLD_CHARS;
  const [renderToken, setRenderToken] = useState(() => (isHeavy ? null : previewContent));

  useEffect(() => {
    if (!isHeavy) {
      setRenderToken(previewContent);
      return;
    }
    setRenderToken(null);
    // Two RAFs: first lets the loading overlay paint, second triggers the
    // heavy `processMarkdown` + `useMarkdownWithComponents` work.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setRenderToken(previewContent));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [isHeavy, previewContent]);

  const isParsing = isHeavy && renderToken !== previewContent;

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
    <View style={styles.scrollView}>
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
            isParsing ? null : (
              <MarkdownBody value={previewContent} styles={markdownStyles} renderer={notePreviewRenderer} />
            )
          ) : parsedStructuredContent ? (
            <StructuredRenderer
              blocks={parsedStructuredContent as never}
              format={noteFormat === 'org' ? 'org' : 'neorg'}
              onOpenNote={onOpenNote}
              currentNotePath={currentNotePath}
              headingPositions={headingPositions}
              scrollRef={previewScrollRef}
              CanvasPreview={CanvasPreview}
            />
          ) : (
            <Text style={[styles.structuredFallback, { color: colors.text }]}>{previewContent}</Text>
          )
        ) : (
          <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}>
            {showLivePreviewLabel ? 'Start writing to see a preview...' : 'No content — tap the pencil to start writing.'}
          </Text>
        )}
      </ScrollView>
      {isParsing ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
          <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[styles.loadingPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingLabel, { color: colors.textSecondary }]}>Loading note…</Text>
          </View>
        </View>
      ) : null}
    </View>
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
  loadingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  loadingLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
});

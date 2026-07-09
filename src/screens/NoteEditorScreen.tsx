import React from 'react';
import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';

import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotes } from '../contexts/NoteContext';
import { useCanvases } from '../contexts/CanvasContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { RootStackParamList } from '../navigation/types';
import VoiceInputModal from '../components/VoiceInputModal';
import CanvasModal from '../components/CanvasModal';
import FolderSelectionDialog from '../components/FolderSelectionDialog';
import { useFolders } from '../contexts/FolderContext';
import { useRepos } from '../contexts/RepoContext';
import { useResponsive } from '../hooks/useResponsive';
import { getMarkdownStyles } from '../utils/preview';
import { useRenderStyle } from '../stores/renderStyleStore';
import { GitHubActivityIndicator } from '../components/GitHubActivityIndicator';
import { CanvasPickerModal } from '../components/editor/CanvasPickerModal';
import { EditorHeader } from '../components/editor/EditorHeader';
import { EditorToolbar } from '../components/editor/EditorToolbar';
import { NoteEditorForm } from '../components/editor/NoteEditorForm';
import { NotePreviewPane } from '../components/editor/NotePreviewPane';
import { NoteViewer } from '../components/editor/NoteViewer';
import { useNoteEditorDocument } from '../components/editor/useNoteEditorDocument';
import { useNoteEditorPreview } from '../components/editor/useNoteEditorPreview';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { useTranslation } from 'react-i18next';
import { ScheduledLearningService } from '../services/ScheduledLearningService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;
type NoteEditorRouteProp = RouteProp<RootStackParamList, 'NoteEditor'>;

export default function NoteEditorScreen() {
  return (
    <ErrorBoundary>
      <NoteEditorScreenInner />
    </ErrorBoundary>
  );
}

function NoteEditorScreenInner() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<NoteEditorRouteProp>();
  const { colors, isDark } = useTheme();
  const { authState, activeAccountId } = useAuth();
  const { sideBySide } = useResponsive();
  const { noteId, format: initialFormat, initialTitle, initialContent, initialTags, repo: initialRepo, branch: initialBranch, folderPath: initialFolderPath, anchor: initialAnchor } = route.params || {};

  const { notes, getNoteById, createNote, updateNote } = useNotes();
  const { canvases } = useCanvases();
  const { folders } = useFolders();
  const { repositories } = useRepos();
  const [showVoiceModal, setShowVoiceModal] = React.useState(false);
  const [showCanvasModal, setShowCanvasModal] = React.useState(false);
  const [showCanvasPicker, setShowCanvasPicker] = React.useState(false);
  const [showFolderDialog, setShowFolderDialog] = React.useState(false);
  const [isGrading, setIsGrading] = React.useState(false);

  const document = useNoteEditorDocument({
    noteId,
    initialFormat,
    initialTitle,
    initialContent,
    initialTags,
    initialRepo,
    initialBranch,
    initialFolderPath,
    activeAccountId,
    repositories,
    folders,
    getNoteById,
    createNote,
    updateNote,
    navigation,
  });

  const markdownOverrides = useRenderStyle('markdown');
  const markdownStyles = React.useMemo(
    () => getMarkdownStyles(colors, isDark, markdownOverrides),
    [colors, isDark, markdownOverrides],
  );
  const preview = useNoteEditorPreview({
    noteId,
    title: document.title,
    content: document.content,
    folderPath: document.folderPath,
    noteFormat: document.noteFormat,
    notes,
    colors,
    isDark,
    navigation,
    markdownStyles,
    initialAnchor,
  });
  const isPdfNote = document.noteFormat === 'pdf';

  const isQuestionerNote = React.useMemo(
    () => document.tags?.includes('questioner') ?? false,
    [document.tags],
  );

  const handleGradeAnswers = React.useCallback(async () => {
    if (!noteId || isGrading) return;
    setIsGrading(true);
    try {
      const success = await ScheduledLearningService.gradeQuestionerNote(noteId);
      if (!success) {
        console.warn('[NoteEditor] Grading failed');
      }
    } finally {
      setIsGrading(false);
    }
  }, [noteId, isGrading]);

  // ── NOT FOUND (deep link to a noteId that isn't on this device) ──
  if (document.notFound) {
    return (
      <SafeAreaView
        testID="note-editor.view.not-found"
        style={[styles.notFoundContainer, { backgroundColor: colors.background }]}
        edges={['top', 'bottom']}
      >
        <Text style={[styles.notFoundTitle, { color: colors.text }]}>{t('notes.notFoundTitle')}</Text>
        <Text style={[styles.notFoundBody, { color: colors.textSecondary }]}>
          {noteId
            ? t('notes.notFoundWithId', { id: noteId })
            : t('notes.notFoundOffline')}
        </Text>
        <Pressable
          testID="note-editor.button.back-to-notes"
          onPress={() => navigation.navigate('MainTabs', { screen: 'NotesTab' })}
          style={[styles.notFoundButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.notFoundButtonText}>{t('notes.backToNotes')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ── PREVIEW MODE ──────────────────────────────────────────────
  if (!document.isEditing) {
    return (
        <NoteViewer
          noteId={noteId!}
          title={document.title}
          noteFormat={document.noteFormat}
          canEdit={!isPdfNote}
          canSpeak={!isPdfNote && !!preview.speakableContent}
        isSpeaking={preview.isSpeaking}
        tocEntries={preview.tocEntries}
        showToc={preview.showToc}
        onBack={() => navigation.goBack()}
        onToggleToc={() => preview.setShowToc(true)}
        onToggleSpeak={preview.handleToggleSpeak}
        onEdit={() => document.setIsEditing(true)}
        onCloseToc={() => preview.setShowToc(false)}
        onTocPress={preview.handleTocPress}
        onNavigateToNote={(id) => navigation.navigate('NoteEditor', { noteId: id })}
          previewContent={preview.previewContent}
          parsedStructuredContent={preview.parsedStructuredContent}
          markdownStyles={preview.markdownStyles}
          notePreviewRenderer={preview.notePreviewRenderer}
          pdfViewerUri={preview.pdfViewerUri}
          authToken={authState.token}
          pdfLoadError={preview.pdfLoadError}
          onPdfError={(message) => preview.setPdfLoadError({ uri: preview.pdfViewerUri, message })}
          onOpenNote={preview.onOpenNote}
          currentNotePath={preview.currentNotePath}
          headingPositions={preview.headingPositions}
          previewScrollRef={preview.previewScrollRef}
          onPreviewScroll={preview.handlePreviewScroll}
          onPreviewContentSizeChange={preview.handlePreviewContentSizeChange}
          isQuestionerNote={isQuestionerNote}
          isGrading={isGrading}
          onGradeAnswers={isQuestionerNote ? handleGradeAnswers : undefined}
        />
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: colors.surface }]}> 
      {document.isSaving ? <GitHubActivityIndicator /> : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <EditorHeader noteId={noteId} isSaving={document.isSaving} onCancel={document.handleCancelEdit} onSave={document.handleSave} />

        <EditorToolbar
          canUndo={document.canUndo}
          canRedo={document.canRedo}
          onUndo={document.handleUndo}
          onRedo={document.handleRedo}
          onVoiceInput={() => setShowVoiceModal(true)}
          onInsertCanvas={() => setShowCanvasModal(true)}
          onInsertImage={document.handlePickImage}
          onLinkCanvas={() => setShowCanvasPicker(true)}
        />

        {sideBySide ? (
          <View style={styles.sideBySideContainer}>
            <View style={styles.sideBySideEditor}>
              <NoteEditorForm
                repo={document.repo}
                branch={document.branch}
                commit={document.commit}
                title={document.title}
                folderPath={document.folderPath}
                noteFormat={document.noteFormat}
                tags={document.tags}
                canvasJsonRefs={document.canvasJsonRefs}
                content={document.content}
                placeholder={document.editorPlaceholder}
                onRepoChange={document.handleRepoChange}
                onBranchChange={document.handleBranchChange}
                onCommitChange={document.handleCommitChange}
                onTitleChange={document.handleTitleChange}
                onOpenFolderDialog={() => setShowFolderDialog(true)}
                onNoteFormatChange={document.handleNoteFormatChange}
                onTagsChange={document.handleTagsChange}
                onEditCanvasJson={(uri) => {
                  document.handleEditCanvasJson(uri);
                  setShowCanvasModal(true);
                }}
                onContentChange={document.handleContentChange}
              />
            </View>
            <View style={styles.sideBySidePreview}>
              <NotePreviewPane
                noteFormat={document.noteFormat}
                previewContent={preview.previewContent}
                parsedStructuredContent={preview.parsedStructuredContent}
                markdownStyles={preview.markdownStyles}
              notePreviewRenderer={preview.notePreviewRenderer}
              pdfViewerUri={preview.pdfViewerUri}
              authToken={authState.token}
              pdfLoadError={preview.pdfLoadError}
              onPdfError={(message) => preview.setPdfLoadError({ uri: preview.pdfViewerUri, message })}
              onOpenNote={preview.onOpenNote}
              currentNotePath={preview.currentNotePath}
              headingPositions={preview.headingPositions}
              showLivePreviewLabel
              bordered
            />
            </View>
          </View>
        ) : (
          <NoteEditorForm
            repo={document.repo}
            branch={document.branch}
            commit={document.commit}
            title={document.title}
            folderPath={document.folderPath}
            noteFormat={document.noteFormat}
            tags={document.tags}
            canvasJsonRefs={document.canvasJsonRefs}
            content={document.content}
            placeholder={document.editorPlaceholder}
            onRepoChange={document.handleRepoChange}
            onBranchChange={document.handleBranchChange}
            onCommitChange={document.handleCommitChange}
            onTitleChange={document.handleTitleChange}
            onOpenFolderDialog={() => setShowFolderDialog(true)}
            onNoteFormatChange={document.handleNoteFormatChange}
            onTagsChange={document.handleTagsChange}
            onEditCanvasJson={(uri) => {
              document.handleEditCanvasJson(uri);
              setShowCanvasModal(true);
            }}
            onContentChange={document.handleContentChange}
          />
        )}
      </KeyboardAvoidingView>

      <VoiceInputModal
        visible={showVoiceModal}
        onDone={(text) => {
          document.handleVoiceDone(text);
          setShowVoiceModal(false);
        }}
        onClose={() => setShowVoiceModal(false)}
      />

      <CanvasModal
        visible={showCanvasModal}
        onSave={(payload) => {
          document.handleCanvasSave(payload);
          setShowCanvasModal(false);
        }}
        onClose={() => {
          setShowCanvasModal(false);
          document.setCanvasEditJsonUri(undefined);
        }}
        editJsonUri={document.canvasEditJsonUri}
      />

      <CanvasPickerModal
        visible={showCanvasPicker}
        canvases={canvases}
        onSelect={(canvasId, canvasTitle) => {
          document.handleLinkCanvas(canvasId, canvasTitle);
          setShowCanvasPicker(false);
        }}
        onClose={() => setShowCanvasPicker(false)}
      />

      <FolderSelectionDialog
        visible={showFolderDialog}
        selectedFolderId={document.selectedFolderId}
        onSelect={document.handleFolderSelect}
        onClose={() => setShowFolderDialog(false)}
        additionalFolders={document.repoFolders}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  sideBySideContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  sideBySideEditor: {
    flex: 1,
  },
  sideBySidePreview: {
    flex: 1,
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  notFoundTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 12,
  },
  notFoundBody: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  notFoundButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  notFoundButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

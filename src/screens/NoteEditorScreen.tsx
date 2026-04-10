import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotes } from '../contexts/NoteContext';
import { useCanvases } from '../contexts/CanvasContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { RootStackParamList } from '../navigation/types';
import MarkdownEditor from '../components/MarkdownEditor';
import GitContextPicker from '../components/GitContextPicker';
import NeorgRenderer from '../components/NeorgRenderer';
import PdfViewer from '../components/PdfViewer';
import TagInput from '../components/TagInput';
import VoiceInputModal from '../components/VoiceInputModal';
import CanvasModal from '../components/CanvasModal';
import { HapticService } from '../utils/haptics';
import { useUndo } from '../utils/useUndo';
import { NoteFormat, NoteGitHubLink } from '../models/Note';
import { Attachment, createAttachment } from '../models/Attachment';
import { NeorgParser } from '../services/NeorgParser';
import { NeorgContentParser } from '../services/NeorgContentParser';
import { canvasToLink } from '../models/Canvas';
import { useResponsive } from '../hooks/useResponsive';
import { syncNoteToGitHub } from '../services/NoteGitHubSyncService';

const FORMAT_OPTIONS: { label: string; value: NoteFormat }[] = [
  { label: '.md', value: 'markdown' },
  { label: '.norg', value: 'neorg' },
  { label: '.org', value: 'org' },
];

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;
type NoteEditorRouteProp = RouteProp<RootStackParamList, 'NoteEditor'>;

function slugifyLocal(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled';
}

function getExtensionForFormat(format?: NoteFormat): string {
  switch (format) {
    case 'neorg': return '.norg';
    case 'org': return '.org';
    default: return '.md';
  }
}

export default function NoteEditorScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<NoteEditorRouteProp>();
  const { colors, isDark } = useTheme();
  const { authState } = useAuth();
  const { sideBySide } = useResponsive();
  const { noteId, format: initialFormat, initialTitle, initialContent, repo: initialRepo, branch: initialBranch, folderPath: initialFolderPath } = route.params || {};

  const { getNoteById, createNote, updateNote } = useNotes();
  const { canvases } = useCanvases();

  const [title, setTitle] = useState(initialTitle ?? '');
  const { state: content, setState: setContent, undo, redo, canUndo, canRedo } = useUndo(initialContent ?? '');
  const [repo, setRepo] = useState<string | undefined>(initialRepo);
  const [branch, setBranch] = useState<string | undefined>(initialBranch);
  const [commit, setCommit] = useState<string | undefined>();
  const [folderPath, setFolderPath] = useState<string | undefined>(initialFolderPath);
  const [github, setGithub] = useState<NoteGitHubLink | undefined>();
  const [noteFormat, setNoteFormat] = useState<NoteFormat>(initialFormat ?? 'markdown');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState<{ uri: string; message: string } | null>(null);

  const [isEditing, setIsEditing] = useState(!noteId);
  const isPdfNote = noteFormat === 'pdf';

  const [tags, setTags] = useState<string[]>([]);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showCanvasModal, setShowCanvasModal] = useState(false);
  const [showCanvasPicker, setShowCanvasPicker] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const resolvePdfUrl = useCallback((value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    const rawGithubMatch = trimmed.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!rawGithubMatch) return trimmed;

    const [, owner, repo, ref, rawPath] = rawGithubMatch;
    const encodedPath = rawPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  }, []);

  useEffect(() => {
    if (noteId) {
      const existingNote = getNoteById(noteId);
      if (existingNote) {
        setTitle(existingNote.title);
        setContent(existingNote.content);
        setRepo(existingNote.repo);
        setBranch(existingNote.branch);
        setCommit(existingNote.commit);
        setFolderPath(existingNote.folderPath);
        setGithub(existingNote.github);
        setNoteFormat(existingNote.format ?? 'markdown');
        setTags(existingNote.tags || []);
        setAttachments(existingNote.attachments || []);
      }
    }
  }, [noteId, getNoteById, setContent]);

  const handleTitleChange = useCallback((text: string) => {
    setTitle(text);
    setHasChanges(true);
  }, []);

  const handleContentChange = useCallback((text: string) => {
    setContent(text);
    setHasChanges(true);
  }, [setContent]);

  const handleRepoChange = useCallback((newRepo: string | undefined) => {
    setRepo(newRepo);
    setBranch(undefined);
    setCommit(undefined);
    setHasChanges(true);
  }, []);

  const handleBranchChange = useCallback((newBranch: string | undefined) => {
    setBranch(newBranch);
    setCommit(undefined);
    setHasChanges(true);
  }, []);

  const handleCommitChange = useCallback((newCommit: string | undefined) => {
    setCommit(newCommit);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim() && !content.trim()) {
      Alert.alert('Empty Note', 'Please add a title or content before saving.');
      return;
    }

    if (!repo) {
      Alert.alert('Repository Required', 'Please select a repository before saving.');
      return;
    }

    setIsSaving(true);
    try {
      let savedNoteId = noteId;

      if (noteId) {
        await updateNote({
          id: noteId,
          title: title.trim(),
          content: content.trim(),
          tags,
          repo,
          branch,
          commit,
          folderPath,
          format: noteFormat,
          attachments,
        });
        setHasChanges(false);
        setIsEditing(false);
        HapticService.success();
      } else {
        const newNote = await createNote({
          title: title.trim(),
          content: content.trim(),
          tags,
          repo,
          branch,
          commit,
          folderPath,
          format: noteFormat,
          attachments,
        });
        savedNoteId = newNote?.id;
        HapticService.success();
        navigation.goBack();
      }

      if (repo && content.trim()) {
        const syncResult = await syncNoteToGitHub({
          repo,
          branch,
          filePath: folderPath ? `${folderPath}/${slugifyLocal(title.trim())}${getExtensionForFormat(noteFormat)}` : undefined,
          title: title.trim(),
          content: content.trim(),
          format: noteFormat,
        });

        if (!syncResult.success) {
          console.warn('[NoteEditor] GitHub sync failed:', syncResult.error);
        }
      }
    } catch (error) {
      HapticService.error();
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [title, content, tags, repo, branch, commit, folderPath, noteFormat, attachments, noteId, createNote, updateNote, navigation]);

  const handleCancelEdit = useCallback(() => {
    if (hasChanges && (title.trim() || content.trim())) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              if (noteId) {
                // Reload original content and go back to preview
                const existingNote = getNoteById(noteId);
                if (existingNote) {
                  setTitle(existingNote.title);
                  setContent(existingNote.content);
                  setRepo(existingNote.repo);
                  setBranch(existingNote.branch);
                  setCommit(existingNote.commit);
                  setFolderPath(existingNote.folderPath);
                  setGithub(existingNote.github);
                  setNoteFormat(existingNote.format ?? 'markdown');
                }
                setHasChanges(false);
                setIsEditing(false);
              } else {
                navigation.goBack();
              }
            },
          },
        ]
      );
    } else if (noteId) {
      setIsEditing(false);
    } else {
      navigation.goBack();
    }
  }, [hasChanges, title, content, noteId, navigation, getNoteById, setContent]);

  const handleUndo = useCallback(() => {
    if (canUndo) {
      HapticService.light();
      undo();
      setHasChanges(true);
    }
  }, [canUndo, undo]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      HapticService.light();
      redo();
      setHasChanges(true);
    }
  }, [canRedo, redo]);

  const handleTagsChange = useCallback((newTags: string[]) => {
    setTags(newTags);
    setHasChanges(true);
  }, []);

  const handleVoiceDone = useCallback((text: string) => {
    if (text.trim()) {
      setContent(content + (content ? '\n' : '') + text);
      setHasChanges(true);
    }
    setShowVoiceModal(false);
  }, [content, setContent]);

  const handleCanvasSave = useCallback((base64Uri: string) => {
    const imageMarkdown = `\n![canvas-drawing](${base64Uri})\n`;
    setContent(content + imageMarkdown);
    setHasChanges(true);
    setShowCanvasModal(false);
  }, [content, setContent]);

  const handleLinkCanvas = useCallback((canvasId: string, canvasTitle: string) => {
    const link = canvasToLink({ id: canvasId } as any);
    let linkText: string;
    if (noteFormat === 'neorg') {
      linkText = `\n{${link}}[${canvasTitle}]\n`;
    } else if (noteFormat === 'org') {
      linkText = `\n[[${link}][${canvasTitle}]]\n`;
    } else {
      linkText = `\n[${canvasTitle}](${link})\n`;
    }
    setContent(content + linkText);
    setHasChanges(true);
    setShowCanvasPicker(false);
  }, [content, setContent, noteFormat]);

  const handlePickImage = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to attach images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const newAttachment = createAttachment({
          uri: asset.uri,
          type: 'image',
          name: asset.fileName || `image-${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          width: asset.width,
          height: asset.height,
        });
        setAttachments(prev => [...prev, newAttachment]);
        setHasChanges(true);

        const imageMarkdown = `\n![${newAttachment.name}](${newAttachment.uri})\n`;
        setContent(content + imageMarkdown);
        HapticService.success();
      }
    } catch (err) {
      console.error('Image picker error:', err);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  }, [content, setContent]);

  const markdownStyles = {
    body: { fontSize: 16, lineHeight: 24, color: colors.text, marginTop: 0 },
    heading1: { fontSize: 28, fontWeight: 'bold' as const, marginBottom: 12, marginTop: 8, color: colors.text },
    heading2: { fontSize: 22, fontWeight: 'bold' as const, marginBottom: 10, marginTop: 8, color: colors.text },
    heading3: { fontSize: 18, fontWeight: '600' as const, marginBottom: 8, marginTop: 6, color: colors.text },
    paragraph: { marginBottom: 12 },
    code_inline: {
      backgroundColor: isDark ? '#2c2c2e' : '#f0f0f0',
      paddingHorizontal: 4,
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 14,
      color: colors.text,
    },
    code_block: {
      backgroundColor: isDark ? '#2c2c2e' : '#f5f5f5',
      padding: 12,
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 14,
      marginVertical: 8,
      color: colors.text,
    },
    fence: {
      backgroundColor: isDark ? '#2c2c2e' : '#f5f5f5',
      padding: 12,
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 14,
      marginVertical: 8,
      color: colors.text,
    },
    blockquote: {
      backgroundColor: colors.primary + '15',
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
      paddingLeft: 12,
      paddingVertical: 8,
      marginVertical: 8,
    },
    link: { color: colors.primary },
    list_item: { marginBottom: 4, color: colors.text },
    bullet_list: { marginBottom: 12 },
    ordered_list: { marginBottom: 12 },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 16 },
    strong: { color: colors.text },
    em: { color: colors.text },
  };

  const previewContent = (() => {
    const stripTopMetadata = (raw: string, format: NoteFormat): string => {
      if (format === 'markdown') {
        const lines = raw.split('\n');
        if (lines[0]?.trim() !== '---') return raw;
        const closingIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
        if (closingIndex === -1) return raw;
        return lines.slice(closingIndex + 1).join('\n').trimStart();
      }

      if (format === 'org') {
        const lines = raw.split('\n');
        let i = 0;
        while (i < lines.length && /^\s*#\+[A-Za-z0-9_]+:\s*.*$/.test(lines[i])) {
          i += 1;
        }
        while (i < lines.length && lines[i].trim() === '') {
          i += 1;
        }
        return i > 0 ? lines.slice(i).join('\n') : raw;
      }

      if (format === 'neorg') {
        const lines = raw.split('\n');
        if (!lines[0]?.trim().startsWith('@document.meta')) return raw;
        const endIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '@end');
        if (endIndex === -1) return raw;
        return lines.slice(endIndex + 1).join('\n').trimStart();
      }

      return raw;
    };

    if (noteFormat === 'pdf') {
      return content.trim();
    }

    if (noteFormat === 'markdown') {
      return stripTopMetadata(content, 'markdown');
    }

    if (noteFormat === 'neorg') {
      const parsed = NeorgParser.parseDocument(stripTopMetadata(content, 'neorg'));
      if (parsed.success && parsed.document) {
        return parsed.document.content;
      }
      return stripTopMetadata(content, 'neorg');
    }

    return stripTopMetadata(content, 'org');
  })();

  const pdfViewerUri = useMemo(() => {
    return resolvePdfUrl(previewContent);
  }, [previewContent, resolvePdfUrl]);

  const parsedStructuredContent = (() => {
    if (noteFormat === 'markdown' || noteFormat === 'pdf') return null;
    const parsed = NeorgContentParser.parseContent(previewContent);
    if (!parsed.success || !parsed.blocks || parsed.blocks.length === 0) return null;
    return parsed.blocks;
  })();

  const editorPlaceholder = (() => {
    switch (noteFormat) {
      case 'org':
        return '* My Heading\n** Sub Heading\n- Bullet item\n1. Numbered item\n- [ ] TODO item\n- [x] Done item\n\nParagraph text here...';
      case 'neorg':
        return '* Document Heading\n** Sub Heading\n- Bullet item\n~ Numbered item\n( ) TODO item\n(x) Done item\n\n```code\n```';
      default:
        return '# Heading\n## Sub Heading\n- Bullet item\n1. Numbered item\n- [ ] TODO item\n\nParagraph text here...';
    }
  })();

  // ── PREVIEW MODE ──────────────────────────────────────────────
  if (!isEditing) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.flex} />
          {!isPdfNote && (
            <TouchableOpacity
              onPress={() => { HapticService.light(); setIsEditing(true); }}
              style={styles.iconButton}
            >
              <Ionicons name="pencil" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {noteFormat === 'pdf' ? (
          <View style={styles.pdfFullScreenContainer}>
            {previewContent.trim() ? (
              pdfViewerUri ? (
                <PdfViewer
                  uri={pdfViewerUri}
                  token={authState.token}
                  style={styles.pdfViewer}
                  onError={(message) => setPdfLoadError({ uri: pdfViewerUri, message })}
                />
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
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.previewContent}
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="automatic"
          >
            {previewContent.trim() ? (
              noteFormat === 'markdown' ? (
                <Markdown style={markdownStyles}>{previewContent}</Markdown>
              ) : parsedStructuredContent ? (
                <NeorgRenderer blocks={parsedStructuredContent} />
              ) : (
                <Text style={[styles.structuredFallback, { color: colors.text }]}>{previewContent}</Text>
              )
            ) : (
              <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}> 
                No content — tap the pencil to start writing.
              </Text>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // ── EDIT MODE ─────────────────────────────────────────────────
  const editorColumn = (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.editorContent}
      keyboardShouldPersistTaps="handled"
    >
      <TextInput
        style={[styles.titleInput, { color: colors.text, borderBottomColor: colors.border }]}
        placeholder="Note Title"
        placeholderTextColor={colors.textSecondary}
        value={title}
        onChangeText={handleTitleChange}
        autoFocus={!noteId}
        maxLength={100}
        returnKeyType="next"
      />

      <View
        style={[styles.folderSelector, { borderBottomColor: colors.border }]}
      >
        <Ionicons
          name="folder-outline"
          size={20}
          color={folderPath ? colors.primary : colors.textSecondary}
        />
        <Text
          style={[
            styles.folderSelectorText,
            { color: folderPath ? colors.text : colors.textSecondary },
          ]}
        >
          {folderPath || 'No folder'}
        </Text>
      </View>

      {/* Format selector */}
      <View style={[styles.formatRow, { borderBottomColor: colors.border }]}>
        <Ionicons name="document-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.formatRowLabel, { color: colors.textSecondary }]}>Format</Text>
        <View style={styles.formatOptions}>
          {FORMAT_OPTIONS.map(({ label, value }) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.formatChip,
                { borderColor: colors.border },
                noteFormat === value && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
              ]}
              onPress={() => { setNoteFormat(value); setHasChanges(true); HapticService.selection(); }}
            >
              <Text style={[styles.formatChipText, { color: noteFormat === value ? colors.primary : colors.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TagInput tags={tags} onTagsChange={handleTagsChange} />

      <MarkdownEditor
        content={content}
        onContentChange={handleContentChange}
        placeholder={editorPlaceholder}
      />

      <View style={styles.gitContextContainer}>
        <GitContextPicker
          repo={repo}
          branch={branch}
          commit={commit}
          onRepoChange={handleRepoChange}
          onBranchChange={handleBranchChange}
          onCommitChange={handleCommitChange}
        />
      </View>
    </ScrollView>
  );

  const livePreview = noteFormat === 'pdf' ? null : (
    <ScrollView
      style={[styles.scrollView, { borderLeftColor: colors.border, borderLeftWidth: StyleSheet.hairlineWidth }]}
      contentContainerStyle={styles.previewContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.livePreviewLabel, { color: colors.textSecondary }]}>Preview</Text>
      {previewContent.trim() ? (
        noteFormat === 'markdown' ? (
          <Markdown style={markdownStyles}>{previewContent}</Markdown>
        ) : parsedStructuredContent ? (
          <NeorgRenderer blocks={parsedStructuredContent} />
        ) : (
          <Text style={[styles.structuredFallback, { color: colors.text }]}>{previewContent}</Text>
        )
      ) : (
        <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}>
          Start writing to see a preview...
        </Text>
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: colors.surface }]}>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleCancelEdit} disabled={isSaving} style={styles.headerTextButton}>
            <Text style={[styles.headerButtonText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          {(canUndo || canRedo) && (
            <View style={styles.undoRedoContainer}>
              <TouchableOpacity onPress={handleUndo} disabled={!canUndo} style={styles.iconButton}>
                <Ionicons name="arrow-undo" size={20} color={canUndo ? colors.primary : colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRedo} disabled={!canRedo} style={styles.iconButton}>
                <Ionicons name="arrow-redo" size={20} color={canRedo ? colors.primary : colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {noteId ? 'Edit Note' : 'New Note'}
        </Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleSave} disabled={isSaving} style={styles.headerTextButton}>
            <Text
              style={[
                styles.headerButtonText,
                styles.saveButtonText,
                { color: colors.primary },
                isSaving && styles.disabledButton,
              ]}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.toolbar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity
          onPress={() => setShowVoiceModal(true)}
          style={styles.toolbarButton}
        >
          <Ionicons name="mic-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowCanvasModal(true)}
          style={styles.toolbarButton}
        >
          <Ionicons name="brush-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handlePickImage}
          style={styles.toolbarButton}
        >
          <Ionicons name="image-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowCanvasPicker(true)}
          style={styles.toolbarButton}
        >
          <Ionicons name="easel-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {sideBySide ? (
        <View style={styles.sideBySideContainer}>
          <View style={styles.sideBySideEditor}>
            {editorColumn}
          </View>
          <View style={styles.sideBySidePreview}>
            {livePreview}
          </View>
        </View>
      ) : (
        editorColumn
      )}
    </KeyboardAvoidingView>

    <VoiceInputModal
      visible={showVoiceModal}
      onDone={handleVoiceDone}
      onClose={() => setShowVoiceModal(false)}
    />

    <CanvasModal
      visible={showCanvasModal}
      onSave={handleCanvasSave}
      onClose={() => setShowCanvasModal(false)}
    />

    <CanvasPickerModal
      visible={showCanvasPicker}
      canvases={canvases}
      onSelect={handleLinkCanvas}
      onClose={() => setShowCanvasPicker(false)}
    />
    </SafeAreaView>
  );
}

import { Modal, FlatList } from 'react-native';
import { Canvas } from '../models/Canvas';

interface CanvasPickerProps {
  visible: boolean;
  canvases: Canvas[];
  onSelect: (canvasId: string, canvasTitle: string) => void;
  onClose: () => void;
}

function CanvasPickerModal({ visible, canvases, onSelect, onClose }: CanvasPickerProps) {
  const { colors } = useTheme();

  const renderItem = ({ item }: { item: Canvas }) => (
    <TouchableOpacity
      style={[canvasPickerStyles.item, { borderBottomColor: colors.border }]}
      onPress={() => onSelect(item.id, item.title)}
    >
      <Ionicons name="easel-outline" size={18} color={colors.primary} />
      <View style={canvasPickerStyles.itemContent}>
        <Text style={[canvasPickerStyles.itemTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[canvasPickerStyles.itemMeta, { color: colors.textSecondary }]}>
          {item.scene?.elements?.length ?? 0} elements
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={[canvasPickerStyles.container, { backgroundColor: colors.background }]}>
        <View style={canvasPickerStyles.header}>
          <TouchableOpacity onPress={onClose} style={canvasPickerStyles.closeBtn}>
            <Text style={[canvasPickerStyles.closeText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[canvasPickerStyles.title, { color: colors.text }]}>Link Canvas</Text>
          <View style={canvasPickerStyles.closeBtn} />
        </View>
        <FlatList
          data={canvases}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={canvasPickerStyles.empty}>
              <Text style={[canvasPickerStyles.emptyText, { color: colors.textSecondary }]}>
                No canvases yet. Create one from the Canvases tab first.
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const canvasPickerStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3a3a3c',
  },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  closeText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '500' },
  itemMeta: { fontSize: 13, marginTop: 2 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
  },
  iconButton: {
    padding: 8,
  },
  headerTextButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 50,
  },
  headerButtonText: {
    fontSize: 16,
  },
  undoRedoContainer: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  saveButtonText: {
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  toolbarButton: {
    padding: 8,
    borderRadius: 8,
  },
  scrollView: {
    flex: 1,
  },
  editorContent: {
    paddingBottom: 120,
  },
  // Preview mode
  previewContent: {
    padding: 20,
    paddingTop: 28,
    paddingBottom: 60,
  },
  previewTitle: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 16,
    lineHeight: 32,
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
  // Edit mode
  titleInput: {
    fontSize: 24,
    fontWeight: '600',
    padding: 16,
    borderBottomWidth: 1,
  },
  folderSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  folderSelectorText: {
    flex: 1,
    fontSize: 16,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  formatRowLabel: {
    fontSize: 14,
    marginRight: 4,
  },
  formatOptions: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  formatChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  formatChipText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  gitContextContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  livePreviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
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
});

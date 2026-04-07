import React, { useState, useEffect, useCallback } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotes } from '../contexts/NoteContext';
import { useFolders } from '../contexts/FolderContext';
import { useTheme } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import MarkdownEditor from '../components/MarkdownEditor';
import GitContextPicker from '../components/GitContextPicker';
import GitHubPicker from '../components/GitHubPicker';
import FolderSelectionDialog from '../components/FolderSelectionDialog';
import { HapticService } from '../utils/haptics';
import { useUndo } from '../utils/useUndo';
import { Folder } from '../models/Folder';
import { NoteFormat, NoteGitHubLink } from '../models/Note';

const FORMAT_OPTIONS: { label: string; value: NoteFormat }[] = [
  { label: '.md', value: 'markdown' },
  { label: '.norg', value: 'neorg' },
  { label: '.org', value: 'org' },
];

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;
type NoteEditorRouteProp = RouteProp<RootStackParamList, 'NoteEditor'>;

export default function NoteEditorScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<NoteEditorRouteProp>();
  const { colors, isDark } = useTheme();
  const { noteId } = route.params || {};
  const { folders } = useFolders();

  const { getNoteById, createNote, updateNote } = useNotes();

  const [title, setTitle] = useState('');
  const { state: content, setState: setContent, undo, redo, canUndo, canRedo } = useUndo('');
  const [repo, setRepo] = useState<string | undefined>();
  const [branch, setBranch] = useState<string | undefined>();
  const [commit, setCommit] = useState<string | undefined>();
  const [folderPath, setFolderPath] = useState<string | undefined>();
  const [github, setGithub] = useState<NoteGitHubLink | undefined>();
  const [noteFormat, setNoteFormat] = useState<NoteFormat>('markdown');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Existing notes open in preview mode; new notes open in edit mode
  const [isEditing, setIsEditing] = useState(!noteId);

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
      }
    }
  }, [noteId, getNoteById, setContent]);

  const selectedFolder: Folder | null = folderPath
    ? folders.find((f) => f.path === folderPath) || null
    : null;

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

  const handleFolderSelect = useCallback((folder: Folder | null) => {
    setFolderPath(folder?.path);
    setHasChanges(true);
    setShowFolderPicker(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim() && !content.trim()) {
      Alert.alert('Empty Note', 'Please add a title or content before saving.');
      return;
    }

    setIsSaving(true);
    try {
      if (noteId) {
        await updateNote({
          id: noteId,
          title: title.trim(),
          content: content.trim(),
          repo,
          branch,
          commit,
          folderPath,
          format: noteFormat,
        });
        setHasChanges(false);
        setIsEditing(false);
        HapticService.success();
      } else {
        await createNote({
          title: title.trim(),
          content: content.trim(),
          repo,
          branch,
          commit,
          folderPath,
          format: noteFormat,
        });
        HapticService.success();
        navigation.goBack();
      }
    } catch (error) {
      HapticService.error();
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [title, content, repo, branch, commit, folderPath, noteId, createNote, updateNote, navigation]);

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

  const markdownStyles = {
    body: { fontSize: 16, lineHeight: 24, color: colors.text },
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
      backgroundColor: isDark ? '#1c2833' : '#f0f8ff',
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

  // ── PREVIEW MODE ──────────────────────────────────────────────
  if (!isEditing) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.flex} />
          <TouchableOpacity
            onPress={() => { HapticService.light(); setIsEditing(true); }}
            style={styles.iconButton}
          >
            <Ionicons name="pencil" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.previewContent}
          showsVerticalScrollIndicator={false}
        >
          {title ? (
            <Text style={[styles.previewTitle, { color: colors.text }]}>{title}</Text>
          ) : null}

          {content.trim() ? (
            <Markdown style={markdownStyles}>{content}</Markdown>
          ) : (
            <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}>
              No content — tap the pencil to start writing.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── EDIT MODE ─────────────────────────────────────────────────
  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.surface }]}>
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

      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
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

        <TouchableOpacity
          style={[styles.folderSelector, { borderBottomColor: colors.border }]}
          onPress={() => setShowFolderPicker(true)}
        >
          <Ionicons
            name="folder"
            size={20}
            color={folderPath ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.folderSelectorText,
              { color: folderPath ? colors.text : colors.textSecondary },
            ]}
          >
            {selectedFolder ? selectedFolder.name : 'No folder selected'}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

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

        <MarkdownEditor
          content={content}
          onContentChange={handleContentChange}
          placeholder="Start writing your note (supports markdown)…"
        />

        <GitContextPicker
          repo={repo}
          branch={branch}
          commit={commit}
          onRepoChange={handleRepoChange}
          onBranchChange={handleBranchChange}
          onCommitChange={handleCommitChange}
        />

        <GitHubPicker value={github} onChange={setGithub} />
      </ScrollView>

      <FolderSelectionDialog
        visible={showFolderPicker}
        selectedFolderId={selectedFolder?.id || null}
        onSelect={handleFolderSelect}
        onClose={() => setShowFolderPicker(false)}
      />
    </KeyboardAvoidingView>
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
    flex: 1,
  },
  iconButton: {
    padding: 8,
  },
  headerTextButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  saveButtonText: {
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  // Preview mode
  previewContent: {
    padding: 20,
    paddingBottom: 40,
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
});

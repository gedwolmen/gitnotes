import React, { useRef } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { NoteFormat } from '../../models/Note';
import { HapticService } from '../../utils/haptics';
import { canPersistNoteTags } from '../../utils/noteTagSupport';
import GitContextPicker from '../GitContextPicker';
import MarkdownEditor, { type MarkdownEditorHandle } from '../MarkdownEditor';
import { MarkdownToolbar } from '../MarkdownToolbar';
import TagInput from '../TagInput';
import { FORMAT_OPTIONS } from './editorShared';

interface NoteEditorFormProps {
  repo?: string;
  branch?: string;
  commit?: string;
  title: string;
  folderPath?: string;
  noteFormat: NoteFormat;
  tags: string[];
  canvasJsonRefs: string[];
  content: string;
  placeholder: string;
  onRepoChange: (repo: string | undefined) => void;
  onBranchChange: (branch: string | undefined) => void;
  onCommitChange: (commit: string | undefined) => void;
  onTitleChange: (value: string) => void;
  onOpenFolderDialog: () => void;
  onNoteFormatChange: (format: NoteFormat) => void;
  onTagsChange: (tags: string[]) => void;
  onEditCanvasJson: (uri: string) => void;
  onContentChange: (value: string) => void;
}

export function NoteEditorForm({
  repo,
  branch,
  commit,
  title,
  folderPath,
  noteFormat,
  tags,
  canvasJsonRefs,
  content,
  placeholder,
  onRepoChange,
  onBranchChange,
  onCommitChange,
  onTitleChange,
  onOpenFolderDialog,
  onNoteFormatChange,
  onTagsChange,
  onEditCanvasJson,
  onContentChange,
}: NoteEditorFormProps) {
  const { colors } = useTheme();
  const bodyRef = useRef<MarkdownEditorHandle>(null);

  return (
    <View style={styles.container}>
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
      <View testID="note-editor-form.picker.repo" style={styles.gitContextContainer}>
        <GitContextPicker
          repo={repo}
          branch={branch}
          commit={commit}
          onRepoChange={onRepoChange}
          onBranchChange={onBranchChange}
          onCommitChange={onCommitChange}
        />
      </View>

      <TextInput
        testID="note-editor-form.input.title"
        style={[styles.titleInput, { color: colors.text, borderBottomColor: colors.border }]}
        placeholder="Note Title"
        placeholderTextColor={colors.textSecondary}
        value={title}
        onChangeText={onTitleChange}
        maxLength={100}
        returnKeyType="next"
        // Pressing Return on the keyboard hops into the body editor (#628)
        // — gives a deterministic way to leave the title field even when the
        // OS doesn't transfer focus from a tap on the body input.
        onSubmitEditing={() => bodyRef.current?.focus()}
      />

      <TouchableOpacity
        testID="note-editor-form.button.open-folder"
        style={[
          styles.folderSelector,
          { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
          !repo && styles.folderSelectorDisabled,
        ]}
        onPress={() => {
          if (!repo) return;
          HapticService.light();
          onOpenFolderDialog();
        }}
        activeOpacity={repo ? 0.7 : 1}
        disabled={!repo}
        accessibilityState={{ disabled: !repo }}
      >
        <Ionicons name="folder-outline" size={18} color={folderPath ? colors.primary : colors.textSecondary} />
        <Text style={[styles.folderSelectorLabel, { color: colors.textSecondary }]}>Folder</Text>
        <Text style={[styles.folderSelectorText, { color: folderPath ? colors.text : colors.textSecondary }]} numberOfLines={1}>
          {folderPath || 'None'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
      {!repo ? (
        <Text
          testID="note-editor-form.text.folder-no-repo-hint"
          style={[styles.folderHint, { color: colors.textSecondary }]}
        >
          Select a repository before choosing a folder.
        </Text>
      ) : null}

      <View style={[styles.formatRow, { borderBottomColor: colors.border }]}> 
        <Ionicons name="document-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.formatRowLabel, { color: colors.textSecondary }]}>Format</Text>
        <View style={styles.formatOptions}>
          {FORMAT_OPTIONS.map(({ label, value }) => (
            <TouchableOpacity
              key={value}
              testID="note-editor-form.picker.format"
              style={[
                styles.formatChip,
                { borderColor: colors.border },
                noteFormat === value && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
              ]}
              onPress={() => {
                onNoteFormatChange(value);
                HapticService.selection();
              }}
            >
              <Text style={[styles.formatChipText, { color: noteFormat === value ? colors.primary : colors.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {canPersistNoteTags(noteFormat) ? <View testID="note-editor-form.input.tags"><TagInput tags={tags} onTagsChange={onTagsChange} /></View> : null}

      {canvasJsonRefs.length > 0 ? (
        <View style={styles.canvasChipsRow}>
          <Text style={[styles.canvasChipsLabel, { color: colors.textSecondary }]}>Canvases</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.canvasChipsScroll}>
            {canvasJsonRefs.map((uri, index) => (
              <TouchableOpacity
                key={uri}
                testID="note-editor-form.button.edit-canvas"
                style={[styles.canvasChip, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                onPress={() => onEditCanvasJson(uri)}
                activeOpacity={0.7}
              >
                <Ionicons name="brush-outline" size={14} color={colors.primary} />
                <Text style={[styles.canvasChipText, { color: colors.text }]} numberOfLines={1}>{`Canvas ${index + 1}`}</Text>
                <Ionicons name="pencil" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <MarkdownEditor
        ref={bodyRef}
        content={content}
        onContentChange={onContentChange}
        placeholder={placeholder}
        inputTestID="note-editor-form.input.content"
        showToolbar={false}
      />
    </ScrollView>

    <View
      style={[styles.stickyToolbar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
      testID="note-editor-form.toolbar.sticky"
    >
      <MarkdownToolbar onFormat={(action) => bodyRef.current?.applyFormat(action)} />
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  editorContent: { paddingBottom: 120 },
  stickyToolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gitContextContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: '600',
    padding: 16,
    borderBottomWidth: 1,
  },
  folderSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  folderSelectorLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  folderSelectorText: {
    flex: 1,
    fontSize: 15,
    textAlign: 'right',
  },
  folderSelectorDisabled: {
    opacity: 0.5,
  },
  folderHint: {
    fontSize: 12,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
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
  canvasChipsRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  canvasChipsLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  canvasChipsScroll: {
    gap: 8,
    paddingRight: 16,
  },
  canvasChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  canvasChipText: {
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 120,
  },
});

import React from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, TouchableOpacity, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Modal } from '../ui';
import { useTheme } from '../../contexts/ThemeContext';
import { NoteTemplateIcon } from '../../services/TemplateService';
import { TEMPLATE_MAX_TAGS, TEMPLATE_MAX_TAG_LENGTH } from '../../utils/templateTags';
import { ICON_OPTIONS } from './templateManagerShared';
import { styles } from './templateManagerStyles';

interface TemplateEditorModalProps {
  visible: boolean;
  editingId: string | null;
  draftName: string;
  draftContent: string;
  draftIcon: NoteTemplateIcon;
  draftDescription: string;
  draftTitle: string;
  draftTags: string[];
  tagDraft: string;
  onClose: () => void;
  onSave: () => void;
  onNameChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onIconChange: (value: NoteTemplateIcon) => void;
  onDescriptionChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onTagInputChange: (value: string) => void;
  onTagSubmit: () => void;
  onRemoveTag: (tag: string) => void;
}

export function TemplateEditorModal({
  visible,
  editingId,
  draftName,
  draftContent,
  draftIcon,
  draftDescription,
  draftTitle,
  draftTags,
  tagDraft,
  onClose,
  onSave,
  onNameChange,
  onContentChange,
  onIconChange,
  onDescriptionChange,
  onTitleChange,
  onTagInputChange,
  onTagSubmit,
  onRemoveTag,
}: TemplateEditorModalProps) {
  const { colors } = useTheme();
  const previewName = draftName.trim() || (editingId ? 'Untitled template' : 'New template');
  const previewDescription = draftDescription.trim() || 'No description yet';
  const tagLimitReached = draftTags.length >= TEMPLATE_MAX_TAGS;

  return (
    <Modal visible={visible} onRequestClose={onClose} contentStyle={styles.modalSurface}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.editorContainer}>
        <Text style={[styles.editorTitle, { color: colors.text }]}>{editingId ? 'Edit template' : 'New template'}</Text>

        <ScrollView
          style={styles.editorScroll}
          contentContainerStyle={styles.editorScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View testID="template-editor.view.preview-card" style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.previewIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name={draftIcon} size={22} color={colors.primary} />
            </View>
            <View style={styles.previewMeta}>
              <Text style={[styles.previewName, { color: colors.text }]} numberOfLines={1}>{previewName}</Text>
              <Text style={[styles.previewDesc, { color: colors.textSecondary }]} numberOfLines={2}>{previewDescription}</Text>
              {draftTags.length > 0 ? (
                <View style={styles.previewTags}>
                  {draftTags.map((tag) => (
                    <View key={`preview-${tag}`} style={[styles.previewTagChip, { backgroundColor: colors.surfaceSecondary }]}>
                      <Text style={[styles.previewTagText, { color: colors.textSecondary }]}>{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
          <TextInput
            testID="template-editor.input.name"
            value={draftName}
            onChangeText={onNameChange}
            placeholder="My template"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            style={[styles.nameInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            maxLength={60}
          />

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Icon</Text>
          <View style={styles.iconGrid} testID="template-editor.view.icon-grid">
            {ICON_OPTIONS.map((icon) => {
              const selected = icon === draftIcon;
              return (
                <TouchableOpacity
                  key={icon}
                  testID={`template-editor.button.select-icon-${icon}`}
                  accessibilityLabel={`Select ${icon} icon`}
                  accessibilityState={{ selected }}
                  onPress={() => onIconChange(icon)}
                  style={[
                    styles.iconCell,
                    { backgroundColor: selected ? colors.primary : colors.surfaceSecondary, borderColor: selected ? colors.primary : colors.border },
                  ]}
                >
                  <Ionicons name={icon} size={20} color={selected ? '#fff' : colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Description</Text>
          <TextInput
            testID="template-editor.input.description"
            value={draftDescription}
            onChangeText={onDescriptionChange}
            placeholder="e.g. Weekly retrospective"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            style={[styles.nameInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            maxLength={120}
          />

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Default note title (optional)</Text>
          <TextInput
            testID="template-editor.input.title"
            value={draftTitle}
            onChangeText={onTitleChange}
            placeholder="e.g. Standup - "
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            style={[styles.nameInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            maxLength={80}
          />

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Tags</Text>
          {draftTags.length > 0 ? (
            <View style={styles.tagChipRow} testID="template-tag-chips">
              {draftTags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  testID={`template-tag-chip-${tag}`}
                  accessibilityLabel={`Remove tag ${tag}`}
                  onPress={() => onRemoveTag(tag)}
                  style={[styles.tagChip, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40' }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tagChipText, { color: colors.primary }]}>{tag}</Text>
                  <Ionicons name="close" size={14} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <TextInput
            testID="template-tag-input"
            value={tagDraft}
            onChangeText={onTagInputChange}
            onSubmitEditing={onTagSubmit}
            onBlur={onTagSubmit}
            placeholder={tagLimitReached ? `Max ${TEMPLATE_MAX_TAGS} tags` : 'Add tags (comma or space to separate)'}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!tagLimitReached}
            maxLength={TEMPLATE_MAX_TAG_LENGTH + 1}
            style={[styles.nameInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            returnKeyType="done"
          />

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Initial content</Text>
          <TextInput
            testID="template-editor.input.content"
            value={draftContent}
            onChangeText={onContentChange}
            placeholder={'## Heading\n\nWrite something...'}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            multiline
            textAlignVertical="top"
            style={[styles.contentInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          />
        </ScrollView>

        <View style={styles.editorActions}>
          <TouchableOpacity testID="template-editor.button.close" onPress={onClose} style={[styles.btn, { borderColor: colors.border }]}>
            <Text style={[styles.btnText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="template-editor.button.save" onPress={onSave} style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primary }]}>
            <Text style={[styles.btnText, { color: '#fff' }]}>{editingId ? 'Save changes' : 'Create'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

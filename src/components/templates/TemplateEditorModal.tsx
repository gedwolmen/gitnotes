import React from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, TouchableOpacity, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Modal } from '../ui';
import { useTheme } from '../../contexts/ThemeContext';
import { NoteTemplateIcon } from '../../services/TemplateService';
import { TEMPLATE_MAX_TAGS, TEMPLATE_MAX_TAG_LENGTH } from '../../utils/templateTags';
import { ICON_OPTIONS } from './templateManagerShared';

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
    <Modal visible={visible} onRequestClose={onClose} contentStyle={{ width: '100%', maxWidth: 480, flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 pt-3 px-5 pb-3">
        <Text className="text-[22px] font-bold mb-[18px]" style={{ color: colors.text }}>{editingId ? 'Edit template' : 'New template'}</Text>

        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View testID="template-editor.view.preview-card" className="flex-row items-center gap-3 p-3 rounded-sm border mb-4" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <View className="w-11 h-11 rounded-sm items-center justify-center" style={{ backgroundColor: colors.primary + '20' }}>
              <Ionicons name={draftIcon} size={22} color={colors.primary} />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-[15px] font-bold" style={{ color: colors.text }} numberOfLines={1}>{previewName}</Text>
              <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }} numberOfLines={2}>{previewDescription}</Text>
              {draftTags.length > 0 ? (
                <View className="flex-row flex-wrap gap-1 mt-1.5">
                  {draftTags.map((tag) => (
                    <View key={`preview-${tag}`} className="rounded px-1.5 py-0.5" style={{ backgroundColor: colors.surfaceSecondary }}>
                      <Text className="text-[11px]" style={{ color: colors.textSecondary }}>{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <Text className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textSecondary, letterSpacing: 0.4 }}>Name</Text>
          <TextInput
            testID="template-editor.input.name"
            value={draftName}
            onChangeText={onNameChange}
            placeholder="My template"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            className="border rounded-[10px] px-3 py-2.5 text-[15px]"
            style={{ color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }}
            maxLength={60}
          />

          <Text className="text-xs font-semibold uppercase tracking-wide mb-1.5 mt-3.5" style={{ color: colors.textSecondary, letterSpacing: 0.4 }}>Icon</Text>
          <View className="flex-row flex-wrap gap-2" testID="template-editor.view.icon-grid">
            {ICON_OPTIONS.map((icon) => {
              const selected = icon === draftIcon;
              return (
                <TouchableOpacity
                  key={icon}
                  testID={`template-editor.button.select-icon-${icon}`}
                  accessibilityLabel={`Select ${icon} icon`}
                  accessibilityState={{ selected }}
                  onPress={() => onIconChange(icon)}
                  className="w-10 h-10 rounded-[10px] border items-center justify-center"
                  style={{
                    backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                    borderColor: selected ? colors.primary : colors.border,
                  }}
                >
                  <Ionicons name={icon} size={20} color={selected ? '#fff' : colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>

          <Text className="text-xs font-semibold uppercase tracking-wide mb-1.5 mt-3.5" style={{ color: colors.textSecondary, letterSpacing: 0.4 }}>Description</Text>
          <TextInput
            testID="template-editor.input.description"
            value={draftDescription}
            onChangeText={onDescriptionChange}
            placeholder="e.g. Weekly retrospective"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            className="border rounded-[10px] px-3 py-2.5 text-[15px]"
            style={{ color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }}
            maxLength={120}
          />

          <Text className="text-xs font-semibold uppercase tracking-wide mb-1.5 mt-3.5" style={{ color: colors.textSecondary, letterSpacing: 0.4 }}>Default note title (optional)</Text>
          <TextInput
            testID="template-editor.input.title"
            value={draftTitle}
            onChangeText={onTitleChange}
            placeholder="e.g. Standup - "
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            className="border rounded-[10px] px-3 py-2.5 text-[15px]"
            style={{ color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }}
            maxLength={80}
          />

          <Text className="text-xs font-semibold uppercase tracking-wide mb-1.5 mt-3.5" style={{ color: colors.textSecondary, letterSpacing: 0.4 }}>Tags</Text>
          {draftTags.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5 mb-2" testID="template-tag-chips">
              {draftTags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  testID={`template-tag-chip-${tag}`}
                  accessibilityLabel={`Remove tag ${tag}`}
                  onPress={() => onRemoveTag(tag)}
                  className="flex-row items-center gap-1 px-2.5 py-1 rounded-[14px] border"
                  style={{ backgroundColor: colors.primary + '20', borderColor: colors.primary + '40' }}
                  activeOpacity={0.7}
                >
                  <Text className="text-[13px] font-medium" style={{ color: colors.primary }}>{tag}</Text>
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
            className="border rounded-[10px] px-3 py-2.5 text-[15px]"
            style={{ color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }}
            returnKeyType="done"
          />

          <Text className="text-xs font-semibold uppercase tracking-wide mb-1.5 mt-3.5" style={{ color: colors.textSecondary, letterSpacing: 0.4 }}>Initial content</Text>
          <TextInput
            testID="template-editor.input.content"
            value={draftContent}
            onChangeText={onContentChange}
            placeholder={'## Heading\n\nWrite something...'}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="sentences"
            multiline
            textAlignVertical="top"
            className="border rounded-[10px] px-3 py-2.5 text-sm min-h-[220px] font-mono"
            style={{ color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }}
          />
        </ScrollView>

        <View className="flex-row justify-end gap-2.5 mt-3">
          <TouchableOpacity testID="template-editor.button.close" onPress={onClose} className="px-4 py-2.5 rounded-[10px] border" style={{ borderColor: colors.border }}>
            <Text className="text-[15px] font-semibold" style={{ color: colors.textSecondary }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="template-editor.button.save" onPress={onSave} className="px-4 py-2.5 rounded-[10px]" style={{ backgroundColor: colors.primary }}>
            <Text className="text-[15px] font-semibold" style={{ color: '#fff' }}>{editingId ? 'Save changes' : 'Create'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

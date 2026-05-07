import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';
import { ScreenHeader, IconButton, Modal, useScreenHeaderHeight } from '../components/ui';
import { useTemplateStore } from '../stores/templateStore';
import { NoteTemplate, NoteTemplateIcon } from '../services/TemplateService';
import { HapticService } from '../utils/haptics';
import { TemplateRepoPreferenceService, TemplateRepoPreference } from '../services/TemplateRepoPreferenceService';
import { pullTemplatesFromConfiguredRepo } from '../services/RepoPullService';
import {
  TEMPLATE_MAX_TAGS,
  TEMPLATE_MAX_TAG_LENGTH,
  commitPendingTag,
  parseTagInput,
} from '../utils/templateTags';

const ICON_OPTIONS: NoteTemplateIcon[] = [
  'document-outline',
  'people-outline',
  'bulb-outline',
  'code-slash-outline',
  'book-outline',
  'bug-outline',
  'checkmark-done-outline',
  'calendar-outline',
  'pencil-outline',
  'flask-outline',
  'rocket-outline',
  'flag-outline',
];

const DEFAULT_ICON: NoteTemplateIcon = 'document-outline';

export default function TemplateManagerScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const headerHeight = useScreenHeaderHeight({ subtitle: true });

  const customTemplates = useTemplateStore((s) => s.customTemplates);
  const pinnedIds = useTemplateStore((s) => s.pinnedIds);
  const loadTemplates = useTemplateStore((s) => s.loadTemplates);
  const createTemplate = useTemplateStore((s) => s.createTemplate);
  const updateTemplate = useTemplateStore((s) => s.updateTemplate);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);
  const togglePin = useTemplateStore((s) => s.togglePin);
  const getAllTemplates = useTemplateStore((s) => s.getAllTemplates);

  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftIcon, setDraftIcon] = useState<NoteTemplateIcon>(DEFAULT_ICON);
  const [draftDescription, setDraftDescription] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [templatesRepoPref, setTemplatesRepoPref] = useState<TemplateRepoPreference | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadTemplates();
    TemplateRepoPreferenceService.get().then(setTemplatesRepoPref);
  }, [loadTemplates]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await pullTemplatesFromConfiguredRepo();
      await loadTemplates();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadTemplates]);

  const allTemplates = useMemo(
    () => getAllTemplates(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customTemplates, pinnedIds, getAllTemplates],
  );

  const resetDraft = useCallback(() => {
    setEditingId(null);
    setDraftName('');
    setDraftContent('');
    setDraftIcon(DEFAULT_ICON);
    setDraftDescription('');
    setDraftTitle('');
    setDraftTags([]);
    setTagDraft('');
  }, []);

  const handleOpenCreate = useCallback(() => {
    resetDraft();
    setShowEditor(true);
  }, [resetDraft]);

  const handleOpenEdit = useCallback((template: NoteTemplate) => {
    setEditingId(template.id);
    setDraftName(template.name);
    setDraftContent(template.content);
    setDraftIcon(template.icon ?? DEFAULT_ICON);
    setDraftDescription(template.description ?? '');
    setDraftTitle(template.title ?? '');
    setDraftTags(template.tags ?? []);
    setTagDraft('');
    setShowEditor(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setShowEditor(false);
  }, []);

  const handleTagInputChange = useCallback(
    (text: string) => {
      const { committed, remainder } = parseTagInput(text, draftTags);
      if (committed.length !== draftTags.length) {
        setDraftTags(committed);
      }
      setTagDraft(remainder);
    },
    [draftTags],
  );

  const handleTagSubmit = useCallback(() => {
    const next = commitPendingTag(tagDraft, draftTags);
    setDraftTags(next);
    setTagDraft('');
  }, [tagDraft, draftTags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setDraftTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleSave = useCallback(async () => {
    const name = draftName.trim();
    if (!name) {
      Alert.alert('Name required', 'Please give your template a name.');
      return;
    }
    const description = draftDescription.trim();
    const trimmedTitle = draftTitle.trim();
    const title = trimmedTitle ? draftTitle : '';
    const finalTags = commitPendingTag(tagDraft, draftTags);

    try {
      if (editingId) {
        await updateTemplate(editingId, {
          name,
          icon: draftIcon,
          description,
          title: title || undefined,
          content: draftContent,
          tags: finalTags,
        });
      } else {
        await createTemplate({
          name,
          icon: draftIcon,
          description,
          title: title || undefined,
          content: draftContent,
          tags: finalTags,
        });
      }
      HapticService.success();
      setShowEditor(false);
    } catch (error) {
      console.error('[TemplateManagerScreen] save failed', error);
      HapticService.error();
      Alert.alert('Save failed', 'Could not save the template. Please try again.');
    }
  }, [
    draftName,
    draftDescription,
    draftTitle,
    draftIcon,
    draftContent,
    draftTags,
    tagDraft,
    editingId,
    createTemplate,
    updateTemplate,
  ]);

  const handleDelete = useCallback(
    (template: NoteTemplate) => {
      if (!template.isCustom) return;
      Alert.alert(
        'Delete template?',
        `"${template.name}" will be permanently removed.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await deleteTemplate(template.id);
              HapticService.success();
            },
          },
        ],
      );
    },
    [deleteTemplate],
  );

  const handleTogglePin = useCallback(
    async (template: NoteTemplate) => {
      await togglePin(template.id);
    },
    [togglePin],
  );

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  const renderRow = (template: NoteTemplate) => {
    const pinned = pinnedIds.includes(template.id);
    return (
      <View
        key={template.id}
        testID={`template-row-${template.id}`}
        style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name={template.icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.rowMeta}>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
            {template.name}
          </Text>
          <Text style={[styles.rowDesc, { color: colors.textSecondary }]} numberOfLines={1}>
            {template.isCustom ? 'Custom' : 'Built-in'}
            {template.description ? ` · ${template.description}` : ''}
          </Text>
        </View>
        <View style={styles.rowActions}>
          <TouchableOpacity
            testID={`template-pin-${template.id}`}
            onPress={() => handleTogglePin(template)}
            style={styles.actionBtn}
            accessibilityLabel={pinned ? 'Unpin template' : 'Pin template'}
          >
            <Ionicons
              name={pinned ? 'star' : 'star-outline'}
              size={20}
              color={pinned ? colors.accent : colors.textSecondary}
            />
          </TouchableOpacity>
          {template.isCustom && (
            <>
              <TouchableOpacity
                testID={`template-edit-${template.id}`}
                onPress={() => handleOpenEdit(template)}
                style={styles.actionBtn}
                accessibilityLabel="Edit template"
              >
                <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                testID={`template-delete-${template.id}`}
                onPress={() => handleDelete(template)}
                style={styles.actionBtn}
                accessibilityLabel="Delete template"
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  const customCount = customTemplates.length;
  const previewName = draftName.trim() || (editingId ? 'Untitled template' : 'New template');
  const previewDescription = draftDescription.trim() || 'No description yet';
  const tagLimitReached = draftTags.length >= TEMPLATE_MAX_TAGS;

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          templatesRepoPref ? (
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          ) : undefined
        }
      >
        <TouchableOpacity
          testID="template-create-cta"
          onPress={handleOpenCreate}
          style={[styles.createCta, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.createCtaText}>New template</Text>
        </TouchableOpacity>

        {allTemplates.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={42} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No templates yet</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Create your first custom template to get started.
            </Text>
          </View>
        ) : (
          allTemplates.map(renderRow)
        )}
      </ScrollView>

      <Modal visible={showEditor} onRequestClose={handleCloseEditor} contentStyle={styles.modalSurface}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.editorContainer}
        >
          <Text style={[styles.editorTitle, { color: colors.text }]}>
            {editingId ? 'Edit template' : 'New template'}
          </Text>

          <ScrollView
            style={styles.editorScroll}
            contentContainerStyle={styles.editorScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              testID="template-preview-card"
              style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.previewIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name={draftIcon} size={22} color={colors.primary} />
              </View>
              <View style={styles.previewMeta}>
                <Text style={[styles.previewName, { color: colors.text }]} numberOfLines={1}>
                  {previewName}
                </Text>
                <Text
                  style={[styles.previewDesc, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {previewDescription}
                </Text>
                {draftTags.length > 0 && (
                  <View style={styles.previewTags}>
                    {draftTags.map((tag) => (
                      <View
                        key={`preview-${tag}`}
                        style={[styles.previewTagChip, { backgroundColor: colors.surfaceSecondary }]}
                      >
                        <Text style={[styles.previewTagText, { color: colors.textSecondary }]}>
                          {tag}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
            <TextInput
              testID="template-name-input"
              value={draftName}
              onChangeText={setDraftName}
              placeholder="My template"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.nameInput,
                { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
              ]}
              maxLength={60}
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Icon</Text>
            <View style={styles.iconGrid} testID="template-icon-grid">
              {ICON_OPTIONS.map((icon) => {
                const selected = icon === draftIcon;
                return (
                  <TouchableOpacity
                    key={icon}
                    testID={`template-icon-${icon}`}
                    accessibilityLabel={`Select ${icon} icon`}
                    accessibilityState={{ selected }}
                    onPress={() => setDraftIcon(icon)}
                    style={[
                      styles.iconCell,
                      {
                        backgroundColor: selected ? colors.primary : colors.surfaceSecondary,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={icon}
                      size={20}
                      color={selected ? '#fff' : colors.textSecondary}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>
              Description
            </Text>
            <TextInput
              testID="template-description-input"
              value={draftDescription}
              onChangeText={setDraftDescription}
              placeholder="e.g. Weekly retrospective"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.nameInput,
                { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
              ]}
              maxLength={120}
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>
              Default note title (optional)
            </Text>
            <TextInput
              testID="template-title-input"
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="e.g. Standup - "
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.nameInput,
                { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
              ]}
              maxLength={80}
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Tags</Text>
            {draftTags.length > 0 && (
              <View style={styles.tagChipRow} testID="template-tag-chips">
                {draftTags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    testID={`template-tag-chip-${tag}`}
                    accessibilityLabel={`Remove tag ${tag}`}
                    onPress={() => handleRemoveTag(tag)}
                    style={[styles.tagChip, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40' }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tagChipText, { color: colors.primary }]}>{tag}</Text>
                    <Ionicons name="close" size={14} color={colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput
              testID="template-tag-input"
              value={tagDraft}
              onChangeText={handleTagInputChange}
              onSubmitEditing={handleTagSubmit}
              onBlur={handleTagSubmit}
              placeholder={
                tagLimitReached
                  ? `Max ${TEMPLATE_MAX_TAGS} tags`
                  : 'Add tags (comma or space to separate)'
              }
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!tagLimitReached}
              maxLength={TEMPLATE_MAX_TAG_LENGTH + 1}
              style={[
                styles.nameInput,
                { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
              ]}
              returnKeyType="done"
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>
              Initial content
            </Text>
            <TextInput
              testID="template-content-input"
              value={draftContent}
              onChangeText={setDraftContent}
              placeholder={'## Heading\n\nWrite something...'}
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              style={[
                styles.contentInput,
                { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
              ]}
            />
          </ScrollView>

          <View style={styles.editorActions}>
            <TouchableOpacity
              testID="template-cancel-btn"
              onPress={handleCloseEditor}
              style={[styles.btn, { borderColor: colors.border }]}
            >
              <Text style={[styles.btnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="template-save-btn"
              onPress={handleSave}
              style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.btnText, { color: '#fff' }]}>
                {editingId ? 'Save changes' : 'Create'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <ScreenHeader
        title="Templates"
        subtitle={
          templatesRepoPref
            ? `${allTemplates.length} total · ${customCount} custom · ${templatesRepoPref.repoPath}`
            : `${allTemplates.length} total · ${customCount} custom`
        }
        onBack={handleBack}
        actions={
          <IconButton size="sm" onPress={handleOpenCreate} accessibilityLabel="New template">
            <Ionicons name="add" size={20} color={colors.accent} />
          </IconButton>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 10, flexGrow: 1 },
  createCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    marginBottom: 8,
  },
  createCtaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMeta: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    padding: 8,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  modalSurface: {
    width: '100%',
    maxWidth: 480,
    flex: 1,
  },
  editorContainer: {
    flex: 1,
    paddingTop: 4,
  },
  editorScroll: {
    flex: 1,
  },
  editorScrollContent: {
    paddingBottom: 16,
  },
  editorTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  nameInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  contentInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 220,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnPrimary: {
    borderColor: 'transparent',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewMeta: {
    flex: 1,
    minWidth: 0,
  },
  previewName: {
    fontSize: 15,
    fontWeight: '700',
  },
  previewDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  previewTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  previewTagChip: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  previewTagText: {
    fontSize: 11,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconCell: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

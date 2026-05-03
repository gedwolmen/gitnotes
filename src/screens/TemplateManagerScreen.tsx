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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';
import { ScreenHeader, IconButton, Modal, useScreenHeaderHeight } from '../components/ui';
import { useTemplateStore } from '../stores/templateStore';
import { NoteTemplate } from '../services/TemplateService';
import { HapticService } from '../utils/haptics';

export default function TemplateManagerScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const headerHeight = useScreenHeaderHeight();

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

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Recompute on store changes (customTemplates / pinnedIds in deps).
  const allTemplates = useMemo(
    () => getAllTemplates(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customTemplates, pinnedIds, getAllTemplates],
  );

  const handleOpenCreate = useCallback(() => {
    setEditingId(null);
    setDraftName('');
    setDraftContent('');
    setShowEditor(true);
  }, []);

  const handleOpenEdit = useCallback((template: NoteTemplate) => {
    setEditingId(template.id);
    setDraftName(template.name);
    setDraftContent(template.content);
    setShowEditor(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setShowEditor(false);
  }, []);

  const handleSave = useCallback(async () => {
    const name = draftName.trim();
    if (!name) {
      Alert.alert('Name required', 'Please give your template a name.');
      return;
    }
    try {
      if (editingId) {
        await updateTemplate(editingId, { name, content: draftContent });
      } else {
        await createTemplate({
          name,
          icon: 'document-outline',
          description: 'Custom template',
          content: draftContent,
          tags: [],
        });
      }
      HapticService.success();
      setShowEditor(false);
    } catch (error) {
      console.error('[TemplateManagerScreen] save failed', error);
      HapticService.error();
      Alert.alert('Save failed', 'Could not save the template. Please try again.');
    }
  }, [draftName, draftContent, editingId, createTemplate, updateTemplate]);

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

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight }]}
        keyboardShouldPersistTaps="handled"
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

      <Modal visible={showEditor} onRequestClose={handleCloseEditor}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.editorContainer}
        >
          <Text style={[styles.editorTitle, { color: colors.text }]}>
            {editingId ? 'Edit template' : 'New template'}
          </Text>
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

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>
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
        subtitle={`${allTemplates.length} total · ${customCount} custom`}
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
  scrollContent: { padding: 16, paddingBottom: 40, gap: 10 },
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
  editorContainer: {
    paddingTop: 4,
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
    minHeight: 160,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
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
});

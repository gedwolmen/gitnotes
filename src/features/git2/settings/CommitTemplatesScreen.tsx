/**
 * CommitTemplatesScreen — manage conventional commit prefixes.
 *
 * Templates define the prefix used when creating automatic commits
 * (e.g., "feat: ", "fix: ", "chore: sync "). Users can add custom
 * templates and select a default.
 *
 * GPL-3.0 derivative of GitSync.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { useGit2SettingsStore, type CommitTemplate } from './git2SettingsStore';
import { HapticService } from '../../../utils/haptics';

export function CommitTemplatesScreen() {
  const { colors } = useTheme();
  const commitTemplates = useGit2SettingsStore((s) => s.commitTemplates);
  const addCommitTemplate = useGit2SettingsStore((s) => s.addCommitTemplate);
  const removeCommitTemplate = useGit2SettingsStore((s) => s.removeCommitTemplate);
  const setDefaultCommitTemplate = useGit2SettingsStore((s) => s.setDefaultCommitTemplate);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrefix, setNewPrefix] = useState('');

  const handleAdd = useCallback(async () => {
    if (!newName.trim() || !newPrefix.trim()) {
      Alert.alert('Missing fields', 'Both name and prefix are required.');
      return;
    }
    await addCommitTemplate({
      name: newName.trim(),
      prefix: newPrefix.trim(),
      isDefault: false,
    });
    setNewName('');
    setNewPrefix('');
    setShowAddForm(false);
    HapticService.success();
  }, [newName, newPrefix, addCommitTemplate]);

  const handleRemove = useCallback((template: CommitTemplate) => {
    if (template.isDefault) {
      Alert.alert('Cannot remove default', 'Select a different default first.');
      return;
    }
    Alert.alert(
      'Remove Template',
      `Remove "${template.name}" (${template.prefix})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeCommitTemplate(template.id);
            HapticService.success();
          },
        },
      ],
    );
  }, [removeCommitTemplate]);

  const handleSetDefault = useCallback(async (id: string) => {
    await setDefaultCommitTemplate(id);
    HapticService.success();
  }, [setDefaultCommitTemplate]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Commit Templates
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        Choose the commit message prefix used for automatic commits. Tap to set as default.
      </Text>

      {commitTemplates.map((template) => (
        <TouchableOpacity
          key={template.id}
          style={[
            styles.templateRow,
            {
              backgroundColor: colors.card,
              borderColor: template.isDefault ? colors.primary : colors.border,
              borderWidth: template.isDefault ? 2 : 1,
            },
          ]}
          onPress={() => handleSetDefault(template.id)}
          onLongPress={() => handleRemove(template)}
        >
          <View style={styles.templateContent}>
            <Text style={[styles.templateName, { color: colors.text }]}>
              {template.name}
            </Text>
            <Text style={[styles.templatePrefix, { color: colors.textSecondary }]}>
              {template.prefix}
            </Text>
          </View>
          {template.isDefault && (
            <View style={[styles.defaultBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.defaultBadgeText}>DEFAULT</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}

      {/* Add new template form */}
      {showAddForm ? (
        <View style={[styles.addForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={newName}
            onChangeText={setNewName}
            placeholder="Template name"
            placeholderTextColor={colors.textSecondary}
          />
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={newPrefix}
            onChangeText={setNewPrefix}
            placeholder="Prefix (e.g., feat: )"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
          />
          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.border }]}
              onPress={() => { setShowAddForm(false); setNewName(''); setNewPrefix(''); }}
            >
              <Text style={[styles.formButtonText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.primary }]}
              onPress={handleAdd}
            >
              <Text style={[styles.formButtonText, { color: '#fff' }]}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.addButton, { borderColor: colors.primary }]}
          onPress={() => setShowAddForm(true)}
        >
          <Text style={[styles.addButtonText, { color: colors.primary }]}>
            + Add Template
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.infoBox}>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Long-press a template to remove it. The default template is used for
          automatic sync commits. Custom prefixes support any conventional commit
          format.
        </Text>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 16,
    lineHeight: 18,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
  },
  templateContent: {
    flex: 1,
  },
  templateName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  templatePrefix: {
    fontSize: 13,
    fontFamily: 'Menlo',
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  defaultBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  addForm: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  formButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  formButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoBox: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
  },
  spacer: {
    height: 60,
  },
});

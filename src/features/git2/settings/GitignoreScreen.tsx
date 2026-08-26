/**
 * GitignoreScreen — manage .gitignore and .git/info/exclude patterns per repo.
 *
 * Users can add ignore patterns that are persisted locally. These are
 * written to the repo's .gitignore (or .git/info/exclude) when sync
 * operations occur.
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
import { useGit2SettingsStore, type GitignoreRule } from './git2SettingsStore';
import { useRepoStore } from '../repositories/repoStore';
import { HapticService } from '../../../utils/haptics';

const COMMON_PATTERNS = [
  { label: 'Node modules', pattern: 'node_modules/' },
  { label: '.env files', pattern: '.env*' },
  { label: 'Build output', pattern: 'dist/' },
  { label: 'macOS metadata', pattern: '.DS_Store' },
  { label: 'IDE settings', pattern: '.idea/' },
  { label: 'VS Code', pattern: '.vscode/' },
  { label: 'Thumbs.db', pattern: 'Thumbs.db' },
];

export function GitignoreScreen() {
  const { colors } = useTheme();
  const gitignoreRules = useGit2SettingsStore((s) => s.gitignoreRules);
  const setGitignoreRules = useGit2SettingsStore((s) => s.setGitignoreRules);
  const repositories = useRepoStore((s) => s.repositories);
  const activeRepoId = useRepoStore((s) => s.activeRepoId);

  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(activeRepoId);
  const [newPattern, setNewPattern] = useState('');

  const currentRules: GitignoreRule[] = selectedRepoId
    ? gitignoreRules[selectedRepoId] ?? []
    : [];

  const handleAddPattern = useCallback(async (pattern: string) => {
    if (!selectedRepoId) {
      Alert.alert('No repo selected', 'Select a repository first.');
      return;
    }
    if (!pattern.trim()) return;

    const trimmed = pattern.trim();
    const exists = currentRules.some((r) => r.pattern === trimmed);
    if (exists) {
      Alert.alert('Duplicate', `Pattern "${trimmed}" already exists.`);
      return;
    }

    const rule: GitignoreRule = { pattern: trimmed, addedAt: Date.now() };
    const updated = [...currentRules, rule];
    await setGitignoreRules(selectedRepoId, updated);
    setNewPattern('');
    HapticService.success();
  }, [selectedRepoId, currentRules, setGitignoreRules]);

  const handleRemovePattern = useCallback(async (pattern: string) => {
    if (!selectedRepoId) return;
    Alert.alert(
      'Remove Pattern',
      `Remove "${pattern}" from the ignore list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updated = currentRules.filter((r) => r.pattern !== pattern);
            await setGitignoreRules(selectedRepoId, updated);
            HapticService.success();
          },
        },
      ],
    );
  }, [selectedRepoId, currentRules, setGitignoreRules]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Repo selector */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Repository
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.repoSelector}>
        {repositories.map((repo) => (
          <TouchableOpacity
            key={repo.id}
            style={[
              styles.repoChip,
              {
                backgroundColor: selectedRepoId === repo.id ? colors.primary : colors.card,
                borderColor: selectedRepoId === repo.id ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setSelectedRepoId(repo.id)}
          >
            <Text
              style={[
                styles.repoChipText,
                { color: selectedRepoId === repo.id ? '#fff' : colors.text },
              ]}
              numberOfLines={1}
            >
              {repo.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {selectedRepoId && (
        <>
          {/* Add pattern input */}
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              value={newPattern}
              onChangeText={setNewPattern}
              placeholder="Add ignore pattern (e.g., *.log)"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => handleAddPattern(newPattern)}
            />
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => handleAddPattern(newPattern)}
            >
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* Common patterns */}
          <Text style={[styles.subsectionTitle, { color: colors.text }]}>
            Quick Add
          </Text>
          <View style={styles.chipGrid}>
            {COMMON_PATTERNS.map((cp) => {
              const exists = currentRules.some((r) => r.pattern === cp.pattern);
              return (
                <TouchableOpacity
                  key={cp.pattern}
                  style={[
                    styles.quickChip,
                    {
                      backgroundColor: exists ? colors.border : colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => !exists && handleAddPattern(cp.pattern)}
                  disabled={exists}
                >
                  <Text
                    style={[
                      styles.quickChipText,
                      { color: exists ? colors.textSecondary : colors.text },
                    ]}
                  >
                    {cp.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Current patterns */}
          {currentRules.length > 0 && (
            <>
              <Text style={[styles.subsectionTitle, { color: colors.text }]}>
                Active Patterns ({currentRules.length})
              </Text>
              {currentRules.map((rule) => (
                <TouchableOpacity
                  key={rule.pattern}
                  style={[styles.ruleRow, { borderBottomColor: colors.border }]}
                  onLongPress={() => handleRemovePattern(rule.pattern)}
                >
                  <Text style={[styles.rulePattern, { color: colors.text }]}>{rule.pattern}</Text>
                  <Text style={[styles.ruleHint, { color: colors.textSecondary }]}>long-press to remove</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </>
      )}

      {!selectedRepoId && repositories.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Add a repository to configure ignore patterns.
          </Text>
        </View>
      )}

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
    paddingBottom: 8,
  },
  repoSelector: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  repoChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  repoChipText: {
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 120,
  },
  addRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  addButton: {
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 20,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rulePattern: {
    fontSize: 14,
    fontFamily: 'Menlo',
    flex: 1,
  },
  ruleHint: {
    fontSize: 11,
    marginLeft: 12,
  },
  emptyState: {
    paddingHorizontal: 20,
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  spacer: {
    height: 60,
  },
});

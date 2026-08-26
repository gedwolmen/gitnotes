import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GitBranch, GitService } from '../services/GitService';
import { LastUsedRepoService } from '../services/LastUsedRepoService';
import { LastSelectionPreferenceService, SelectionEntityType } from '../services/LastSelectionPreferenceService';
import { useRepos } from '../contexts/RepoContext';
import { useTheme } from '../contexts/ThemeContext';
import { HapticService } from '../utils/haptics';
import { Modal } from './ui';

interface GitContextPickerProps {
  repo?: string;
  branch?: string;
  commit?: string;
  entityType?: SelectionEntityType;
  onRepoChange: (repo: string | undefined) => void;
  onBranchChange: (branch: string | undefined) => void;
  onCommitChange: (commit: string | undefined) => void;
}

type SheetView = 'main' | 'repo' | 'branch';

export default function GitContextPicker({
  repo,
  branch,
  entityType,
  onRepoChange,
  onBranchChange,
  onCommitChange,
}: GitContextPickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [view, setView] = useState<SheetView>('main');
  const [isLoading, setIsLoading] = useState(false);
  const { repositories } = useRepos();
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [repoSearch, setRepoSearch] = useState('');
  const [branchInput, setBranchInput] = useState('');

  const { colors } = useTheme();

  const filteredRepos = useMemo(
    () =>
      repositories.filter(
        (r) =>
          !repoSearch.trim() ||
          r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
          r.path.toLowerCase().includes(repoSearch.toLowerCase()),
      ),
    [repositories, repoSearch],
  );

  const goToRepoView = useCallback(() => {
    setRepoSearch('');
    setView('repo');
  }, []);

  const goToBranchView = useCallback(async () => {
    if (!repo) return;
    setBranchInput('');
    setView('branch');
    setIsLoading(true);
    try {
      setBranches(await GitService.getBranches(repo));
    } catch (error) {
      console.warn('[GitContextPicker] goToBranchView failed:', error);
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  }, [repo]);

  const refreshBranches = useCallback(async () => {
    if (!repo) return;
    setIsLoading(true);
    try {
      await GitService.clearCache();
      setBranches(await GitService.getBranches(repo));
    } catch (error) {
      console.warn('[GitContextPicker] refreshBranches failed:', error);
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  }, [repo]);

  const openSheet = useCallback(() => {
    setView('main');
    setIsExpanded(true);
  }, []);

  const closeSheet = useCallback(() => {
    setIsExpanded(false);
    setView('main');
  }, []);

  const goBackToMain = useCallback(() => {
    setView('main');
  }, []);

  const handleClearContext = useCallback(() => {
    onRepoChange(undefined);
    onBranchChange(undefined);
    onCommitChange(undefined);
  }, [onRepoChange, onBranchChange, onCommitChange]);

  const handleRepoPick = useCallback(
    (path: string) => {
      HapticService.selection();
      onRepoChange(path);
      onBranchChange(undefined);
      onCommitChange(undefined);
      void LastUsedRepoService.set(path);
      if (entityType) {
        void LastSelectionPreferenceService.set(entityType, { repo: path });
      }
      setView('main');
    },
    [onRepoChange, onBranchChange, onCommitChange, entityType],
  );

  // Auto-fill the repo when opening this picker for a new note/canvas/etc.
  // Single repo: pick it. Multiple: pick whichever was last used. We only
  // run this once per mount and only when the parent didn't already
  // provide a repo, so re-picks and explicit clears stay sticky.
  const didAutoFillRef = useRef(false);
  useEffect(() => {
    if (didAutoFillRef.current) return;
    if (repo) {
      didAutoFillRef.current = true;
      return;
    }
    if (repositories.length === 0) return;
    didAutoFillRef.current = true;

    if (repositories.length === 1) {
      onRepoChange(repositories[0].path);
      void LastUsedRepoService.set(repositories[0].path);
      return;
    }

    void LastUsedRepoService.get().then((lastPath) => {
      if (!lastPath) return;
      const stillExists = repositories.some((r) => r.path === lastPath);
      if (stillExists) onRepoChange(lastPath);
    });
  }, [repo, repositories, onRepoChange]);

  // Auto-fill branch when repo is set but branch is not.
  // Priority: last selected branch for entityType > default branch (isCurrent: true).
  const didAutoFillBranchRef = useRef(false);
  useEffect(() => {
    if (!repo || branch) {
      didAutoFillBranchRef.current = false;
      return;
    }
    if (didAutoFillBranchRef.current) return;
    didAutoFillBranchRef.current = true;

    const autoFill = async () => {
      try {
        const branchList = await GitService.getBranches(repo);
        if (branchList.length === 0) return;

        // Try last selected branch first
        let lastBranch: string | undefined;
        if (entityType) {
          const lastSelection = await LastSelectionPreferenceService.get(entityType);
          lastBranch = lastSelection.branch;
        }

        if (lastBranch && branchList.some((b) => b.name === lastBranch)) {
          onBranchChange(lastBranch);
          return;
        }

        // Fall back to default branch
        const defaultBranch = branchList.find((b) => b.isCurrent);
        if (defaultBranch) {
          onBranchChange(defaultBranch.name);
          return;
        }

        // Last resort: first branch
        onBranchChange(branchList[0].name);
      } catch {
        // Silently fail - user can still manually select
      }
    };

    void autoFill();
  }, [repo, branch, entityType, onBranchChange]);

  const handleBranchPick = useCallback(
    (name: string) => {
      HapticService.selection();
      onBranchChange(name);
      if (entityType && repo) {
        void LastSelectionPreferenceService.set(entityType, { repo, branch: name });
      }
      setView('main');
    },
    [onBranchChange, entityType, repo],
  );

  const isListView = view !== 'main';
  const headerTitle =
    view === 'repo' ? 'Select Repository' : view === 'branch' ? 'Select Branch' : 'Git Context';

  return (
    <View>
      <TouchableOpacity
        testID="git-context-picker.button.open"
        accessibilityRole="button"
        style={[
          styles.triggerButton,
          { backgroundColor: colors.surface, borderColor: repo ? colors.primary : colors.border },
        ]}
        onPress={openSheet}
        activeOpacity={0.7}
      >
        <Ionicons name="git-branch" size={18} color={repo ? colors.primary : colors.textSecondary} />
        <Text
          style={[styles.triggerText, { color: repo ? colors.text : colors.textSecondary }]}
          numberOfLines={1}
        >
          {repo
            ? `${repo.split('/').pop()}${branch ? ` · ${branch}` : ''}`
            : repositories.length === 0
            ? 'None'
            : 'Select repository'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={isExpanded}
        onRequestClose={closeSheet}
        bottomSheet
        contentStyle={isListView ? { height: '85%' } : undefined}
      >
        <SafeAreaView
          edges={['bottom']}
          style={isListView ? styles.sheetFill : styles.sheetAuto}
        >
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              {isListView ? (
                <TouchableOpacity
                  onPress={goBackToMain}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.backButton}
                >
                  <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <View style={styles.backButton} />
              )}
              <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
                {headerTitle}
              </Text>
              <TouchableOpacity
                onPress={closeSheet}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {view === 'main' && (
              <View style={styles.content}>
                <TouchableOpacity testID="todo-editor.button.repo" accessibilityRole="button" style={styles.selector} onPress={goToRepoView}>
                  <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Repository</Text>
                  <View style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text
                      style={
                        repo
                          ? [styles.valueText, { color: colors.text }]
                          : [styles.placeholderText, { color: colors.textSecondary }]
                      }
                    >
                      {repo || 'Select repository'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>

                <View testID="note-editor-form.picker.branch">
                  {repo && (
                    <TouchableOpacity testID="todo-editor.button.branch" accessibilityRole="button" style={styles.selector} onPress={goToBranchView}>
                    <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Branch</Text>
                    <View style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text
                        style={
                          branch
                            ? [styles.valueText, { color: colors.text }]
                            : [styles.placeholderText, { color: colors.textSecondary }]
                        }
                      >
                        {branch || 'Select branch'}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>
                )}
                </View>

                <View testID="note-editor-form.picker.commit" />
                {(repo || branch) && (
                  <TouchableOpacity style={styles.clearButton} accessibilityRole="button" onPress={handleClearContext}>
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={[styles.clearButtonText, { color: colors.error }]}>Clear Git Context</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {view === 'repo' && (
              <>
                <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
                  <Ionicons name="search" size={16} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Search repositories…"
                    placeholderTextColor={colors.textSecondary}
                    value={repoSearch}
                    onChangeText={setRepoSearch}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {repoSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setRepoSearch('')}>
                      <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
                {filteredRepos.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={[styles.emptyText, { color: colors.text }]}>
                      {repositories.length === 0 ? 'No repositories added yet' : 'No matches'}
                    </Text>
                    {repositories.length === 0 && (
                      <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                        Add repositories in Settings
                      </Text>
                    )}
                  </View>
                ) : (
                  <FlatList
                    data={filteredRepos}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        testID="git-context-picker.picker.pick"
                        accessibilityRole="button"
                        style={[styles.listItem, { borderBottomColor: colors.border }]}
                        onPress={() => handleRepoPick(item.path)}
                      >
                        <Ionicons name="folder" size={20} color={colors.primary} />
                        <View style={styles.listItemInfo}>
                          <Text style={[styles.listItemText, { color: colors.text }]}>{item.name}</Text>
                          <Text
                            style={[styles.listItemSub, { color: colors.textSecondary }]}
                            numberOfLines={1}
                          >
                            {item.path}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </>
            )}

            {view === 'branch' && (
              <>
                <View style={[styles.inputRow, { borderBottomColor: colors.border }]}>
                  <TextInput
                    style={[styles.textInput, { color: colors.text, borderColor: colors.border }]}
                    placeholder="Type branch name (e.g. main)"
                    placeholderTextColor={colors.textSecondary}
                    value={branchInput}
                    onChangeText={setBranchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[
                      styles.useButton,
                      { backgroundColor: colors.primary },
                      !branchInput.trim() && styles.useButtonDisabled,
                    ]}
                    onPress={() => {
                      if (!branchInput.trim()) return;
                      handleBranchPick(branchInput.trim());
                      setBranchInput('');
                    }}
                    disabled={!branchInput.trim()}
                  >
                    <Text style={styles.useButtonText}>Use</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={refreshBranches} style={styles.iconButton}>
                    <Ionicons name="refresh" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                {isLoading ? (
                  <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
                ) : (
                  <FlatList
                    data={branches}
                    keyExtractor={(item) => item.name}
                    keyboardShouldPersistTaps="handled"
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        accessibilityRole="button"
                        style={[
                          styles.listItem,
                          { borderBottomColor: colors.border },
                          item.isCurrent && { backgroundColor: colors.surfaceSecondary },
                        ]}
                        onPress={() => handleBranchPick(item.name)}
                      >
                        <Ionicons
                          name={item.isCurrent ? 'checkmark-circle' : 'git-branch'}
                          size={20}
                          color={item.isCurrent ? '#34C759' : colors.textSecondary}
                        />
                        <Text style={[styles.listItemText, { color: colors.text }]}>{item.name}</Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </>
            )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  triggerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  triggerText: {
    fontSize: 15,
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  selector: {
    marginBottom: 8,
  },
  selectorLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  selectorValue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  valueText: {
    fontSize: 15,
    flex: 1,
  },
  placeholderText: {
    fontSize: 15,
    flex: 1,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 4,
    gap: 4,
  },
  clearButtonText: {
    fontSize: 14,
  },
  sheetFill: {
    flex: 1,
    paddingBottom: 8,
  },
  sheetAuto: {
    paddingBottom: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 8,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  backButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  useButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  useButtonDisabled: {
    opacity: 0.4,
  },
  useButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  iconButton: {
    padding: 4,
  },
  loader: {
    padding: 40,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemText: {
    fontSize: 15,
  },
  listItemSub: {
    fontSize: 12,
    marginTop: 2,
  },
});

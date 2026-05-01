import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GitBranch, GitCommit, GitService } from '../services/GitService';
import { useRepos } from '../contexts/RepoContext';
import { useTheme } from '../contexts/ThemeContext';
import { HapticService } from '../utils/haptics';
import { Modal } from './ui';

interface GitContextPickerProps {
  repo?: string;
  branch?: string;
  commit?: string;
  onRepoChange: (repo: string | undefined) => void;
  onBranchChange: (branch: string | undefined) => void;
  onCommitChange: (commit: string | undefined) => void;
}

interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function BottomSheet({ visible, title, onClose, children }: BottomSheetProps) {
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      fullWidth
      contentStyle={styles.modalContent}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheetContainer}
      >
        <SafeAreaView
          edges={['bottom']}
          style={[styles.sheet, { backgroundColor: colors.surface }]}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {children}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function GitContextPicker({
  repo,
  branch,
  commit,
  onRepoChange,
  onBranchChange,
  onCommitChange,
}: GitContextPickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { repositories } = useRepos();
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);

  const [showRepoModal, setShowRepoModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showCommitModal, setShowCommitModal] = useState(false);

  const [repoSearch, setRepoSearch] = useState('');
  const [branchInput, setBranchInput] = useState('');
  const [commitInput, setCommitInput] = useState('');

  const { colors } = useTheme();

  const filteredRepos = useMemo(
    () =>
      repositories.filter(
        (r) =>
          !repoSearch.trim() ||
          r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
          r.path.toLowerCase().includes(repoSearch.toLowerCase())
      ),
    [repositories, repoSearch]
  );

  const openRepoModal = useCallback(async () => {
    setRepoSearch('');
    setIsExpanded(false);
    setShowRepoModal(true);
  }, []);

  const openBranchModal = useCallback(async () => {
    if (!repo) return;
    setBranchInput('');
    setIsExpanded(false);
    setShowBranchModal(true);
    setIsLoading(true);
    try {
      setBranches(await GitService.getBranches(repo));
    } catch {
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
    } catch {
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  }, [repo]);

  const openCommitModal = useCallback(async () => {
    if (!repo) return;
    setCommitInput('');
    setIsExpanded(false);
    setShowCommitModal(true);
    setIsLoading(true);
    try {
      setCommits(await GitService.getCommits(repo, branch));
    } catch {
      setCommits([]);
    } finally {
      setIsLoading(false);
    }
  }, [repo, branch]);

  const refreshCommits = useCallback(async () => {
    if (!repo) return;
    setIsLoading(true);
    try {
      await GitService.clearCache();
      setCommits(await GitService.getCommits(repo, branch));
    } catch {
      setCommits([]);
    } finally {
      setIsLoading(false);
    }
  }, [repo, branch]);

  const openContextModal = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const closeContextModal = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const handleClearContext = useCallback(() => {
    onRepoChange(undefined);
    onBranchChange(undefined);
    onCommitChange(undefined);
  }, [onRepoChange, onBranchChange, onCommitChange]);

  return (
    <View>
      <TouchableOpacity
        style={[styles.triggerButton, { backgroundColor: colors.surface, borderColor: repo ? colors.primary : colors.border }]}
        onPress={openContextModal}
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

      {/* Main context modal */}
      <Modal
        visible={isExpanded}
        onRequestClose={closeContextModal}
        fullWidth
        contentStyle={styles.modalContent}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetContainer}
        >
          <SafeAreaView
            edges={['bottom']}
            style={[styles.sheet, { backgroundColor: colors.surface }]}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Git Context</Text>
              <TouchableOpacity onPress={closeContextModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.content}>
              <TouchableOpacity style={styles.selector} onPress={openRepoModal}>
                <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Repository</Text>
                <View style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={repo ? [styles.valueText, { color: colors.text }] : [styles.placeholderText, { color: colors.textSecondary }]}>
                    {repo || 'Select repository'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>

              {repo && (
                <TouchableOpacity style={styles.selector} onPress={openBranchModal}>
                  <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Branch</Text>
                  <View style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={branch ? [styles.valueText, { color: colors.text }] : [styles.placeholderText, { color: colors.textSecondary }]}>
                      {branch || 'Select branch'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              )}

              {repo && branch && (
                <TouchableOpacity style={styles.selector} onPress={openCommitModal}>
                  <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Commit</Text>
                  <View style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={commit ? [styles.valueText, { color: colors.text }] : [styles.placeholderText, { color: colors.textSecondary }]}>
                      {commit ? commit.substring(0, 7) : 'Select commit (optional)'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              )}

              {(repo || branch || commit) && (
                <TouchableOpacity style={styles.clearButton} onPress={handleClearContext}>
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                  <Text style={[styles.clearButtonText, { color: colors.error }]}>Clear Git Context</Text>
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Repo modal */}
      <BottomSheet visible={showRepoModal} title="Select Repository" onClose={() => setShowRepoModal(false)}>
        <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textSecondary} style={styles.searchIcon} />
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
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : filteredRepos.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.text }]}>
              {repositories.length === 0 ? 'No repositories added yet' : 'No matches'}
            </Text>
            {repositories.length === 0 && (
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Add repositories in Settings</Text>
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
                style={[styles.listItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  HapticService.selection();
                  onRepoChange(item.path);
                  onBranchChange(undefined);
                  onCommitChange(undefined);
                  setShowRepoModal(false);
                }}
              >
                <Ionicons name="folder" size={20} color={colors.primary} />
                <View style={styles.listItemInfo}>
                  <Text style={[styles.listItemText, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.listItemSub, { color: colors.textSecondary }]} numberOfLines={1}>{item.path}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </BottomSheet>

      {/* Branch modal */}
      <BottomSheet visible={showBranchModal} title="Select Branch" onClose={() => setShowBranchModal(false)}>
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
            style={[styles.useButton, { backgroundColor: colors.primary }, !branchInput.trim() && styles.useButtonDisabled]}
            onPress={() => {
              if (!branchInput.trim()) return;
              HapticService.selection();
              onBranchChange(branchInput.trim());
              setBranchInput('');
              setShowBranchModal(false);
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
                style={[
                  styles.listItem,
                  { borderBottomColor: colors.border },
                  item.isCurrent && { backgroundColor: colors.surfaceSecondary },
                ]}
                onPress={() => {
                  HapticService.selection();
                  onBranchChange(item.name);
                  setShowBranchModal(false);
                }}
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
      </BottomSheet>

      {/* Commit modal */}
      <BottomSheet visible={showCommitModal} title="Select Commit" onClose={() => setShowCommitModal(false)}>
        <View style={[styles.inputRow, { borderBottomColor: colors.border }]}>
          <TextInput
            style={[styles.textInput, { color: colors.text, borderColor: colors.border }]}
            placeholder="Paste commit hash (e.g. 4b825dc)"
            placeholderTextColor={colors.textSecondary}
            value={commitInput}
            onChangeText={setCommitInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.useButton, { backgroundColor: colors.primary }, !commitInput.trim() && styles.useButtonDisabled]}
            onPress={() => {
              if (!commitInput.trim()) return;
              HapticService.selection();
              onCommitChange(commitInput.trim());
              setCommitInput('');
              setShowCommitModal(false);
            }}
            disabled={!commitInput.trim()}
          >
            <Text style={styles.useButtonText}>Use</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={refreshCommits} style={styles.iconButton}>
            <Ionicons name="refresh" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : commits.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.text }]}>No commits found</Text>
          </View>
        ) : (
          <FlatList
            data={commits}
            keyExtractor={(item) => item.hash}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.commitItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  HapticService.selection();
                  onCommitChange(item.hash);
                  setShowCommitModal(false);
                }}
              >
                <Text style={[styles.commitHash, { color: colors.primary }]}>{item.shortHash}</Text>
                <Text style={[styles.commitMessage, { color: colors.text }]} numberOfLines={1}>{item.message}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </BottomSheet>
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
  modalContent: {
    padding: 0,
    width: '100%',
    height: '85%',
  },
  sheetContainer: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    flex: 1,
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
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchIcon: {},
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
  commitItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commitHash: {
    fontSize: 13,
    fontFamily: 'monospace',
    marginBottom: 3,
  },
  commitMessage: {
    fontSize: 14,
  },
});

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useRepos } from '../contexts/RepoContext';
import { GitService, GitBranch, GitRepositoryFolder } from '../services/GitService';
import { GitHubService, GitHubContent } from '../services/GitHubService';
import { HapticService } from '../utils/haptics';
import { Modal } from './ui';
import { parseRepoPath } from '../utils/gitPathParser';

interface RepoFolderPickerModalProps {
  visible: boolean;
  repoPath: string | null;
  branch: string | null;
  folderPath: string | null;
  onSelect: (repoPath: string | null, branch: string | null, folderPath: string | null) => void;
  onClose: () => void;
}

type PickerView = 'main' | 'repo' | 'branch' | 'folder';

export default function RepoFolderPickerModal({
  visible,
  repoPath,
  branch,
  folderPath,
  onSelect,
  onClose,
}: RepoFolderPickerModalProps) {
  const { colors } = useTheme();
  const { repositories } = useRepos();

  const [view, setView] = useState<PickerView>('main');
  const [isLoading, setIsLoading] = useState(false);

  const [repoSearch, setRepoSearch] = useState('');
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [branchInput, setBranchInput] = useState('');

  const [currentFolderPath, setCurrentFolderPath] = useState('');
  const [folderItems, setFolderItems] = useState<GitHubContent[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const parsedRepo = useMemo(() => repoPath ? parseRepoPath(repoPath) : null, [repoPath]);

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

  const resetState = useCallback(() => {
    setView('main');
    setRepoSearch('');
    setBranchInput('');
    setBranches([]);
    setCurrentFolderPath('');
    setFolderItems([]);
    setShowNewFolderModal(false);
    setNewFolderName('');
  }, []);

  useEffect(() => {
    if (!visible) {
      resetState();
    }
  }, [visible, resetState]);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const goToRepoView = useCallback(() => {
    setRepoSearch('');
    setView('repo');
  }, []);

  const goToBranchView = useCallback(async () => {
    if (!repoPath) return;
    setBranchInput('');
    setView('branch');
    setIsLoading(true);
    try {
      setBranches(await GitService.getBranches(repoPath));
    } catch (error) {
      console.warn('[RepoFolderPicker] Failed to load branches:', error);
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  const loadFolderContents = useCallback(async (path: string) => {
    if (!parsedRepo) return;
    setIsLoadingFolders(true);
    try {
      const contents = await GitHubService.getRepoContents(
        parsedRepo.owner,
        parsedRepo.repo,
        path,
        branch || undefined
      );
      const filtered = contents
        .filter((item: GitHubContent) => item.type === 'dir' || item.type === 'file')
        .filter((item: GitHubContent) => {
          if (item.name === '.gitkeep') return false;
          if (item.type === 'file') {
            const ext = item.name.toLowerCase().slice(item.name.lastIndexOf('.'));
            const noteExts = ['.md', '.markdown', '.norg', '.org', '.pdf'];
            return noteExts.includes(ext);
          }
          return true;
        })
        .sort((a: GitHubContent, b: GitHubContent) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      setFolderItems(filtered);
    } catch (error) {
      console.warn('[RepoFolderPicker] Failed to load folder contents:', error);
      setFolderItems([]);
    } finally {
      setIsLoadingFolders(false);
    }
  }, [parsedRepo, branch]);

  const goToFolderView = useCallback(() => {
    setView('folder');
    const initialPath = folderPath || '';
    setCurrentFolderPath(initialPath);
    setIsLoadingFolders(true);
    if (!parsedRepo) {
      setFolderItems([]);
      setIsLoadingFolders(false);
      return;
    }
    GitHubService.getRepoContents(
      parsedRepo.owner,
      parsedRepo.repo,
      initialPath,
      branch || undefined
    )
      .then((contents) => {
        const filtered = contents
          .filter((item: GitHubContent) => item.type === 'dir' || item.type === 'file')
          .filter((item: GitHubContent) => {
            if (item.name === '.gitkeep') return false;
            if (item.type === 'file') {
              const ext = item.name.toLowerCase().slice(item.name.lastIndexOf('.'));
              const noteExts = ['.md', '.markdown', '.norg', '.org', '.pdf'];
              return noteExts.includes(ext);
            }
            return true;
          })
          .sort((a: GitHubContent, b: GitHubContent) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        setFolderItems(filtered);
      })
      .catch((error) => {
        console.warn('[RepoFolderPicker] Failed to load folder contents:', error);
        setFolderItems([]);
      })
      .finally(() => {
        setIsLoadingFolders(false);
      });
  }, [folderPath, parsedRepo, branch]);

  const handleRepoSelect = useCallback((path: string) => {
    HapticService.selection();
    onSelect(path, null, null);
    setView('main');
  }, [onSelect]);

  const handleBranchSelect = useCallback((branchName: string) => {
    HapticService.selection();
    onSelect(repoPath, branchName, null);
    setView('main');
  }, [onSelect, repoPath]);

  const handleFolderSelect = useCallback((path: string) => {
    HapticService.selection();
    onSelect(repoPath, branch, path);
    setView('main');
  }, [onSelect, repoPath, branch]);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || !parsedRepo) return;

    setIsLoading(true);
    try {
      const folderPath = currentFolderPath ? `${currentFolderPath}/${name}` : name;
      const result = await GitHubService.createFolder(
        parsedRepo.owner,
        parsedRepo.repo,
        folderPath,
        branch || 'main'
      );
      if (result) {
        HapticService.success();
        setShowNewFolderModal(false);
        setNewFolderName('');
        loadFolderContents(currentFolderPath);
        onSelect(repoPath, branch, folderPath);
      } else {
        Alert.alert('Error', 'Failed to create folder on GitHub.');
      }
    } catch (error) {
      console.warn('[RepoFolderPicker] handleCreateFolder failed:', error);
      Alert.alert('Error', 'Failed to create folder.');
    } finally {
      setIsLoading(false);
    }
  }, [newFolderName, currentFolderPath, parsedRepo, branch, repoPath, loadFolderContents, onSelect]);

  const navigateUp = useCallback(() => {
    HapticService.light();
    const parts = currentFolderPath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    setCurrentFolderPath(parentPath);
    loadFolderContents(parentPath);
  }, [currentFolderPath, loadFolderContents]);

  const navigateToFolder = useCallback((path: string) => {
    HapticService.light();
    setCurrentFolderPath(path);
    loadFolderContents(path);
  }, [loadFolderContents]);

  const handleCustomBranch = useCallback(() => {
    if (!branchInput.trim() || !repoPath) return;
    handleBranchSelect(branchInput.trim());
    setBranchInput('');
  }, [branchInput, repoPath, handleBranchSelect]);

  const pathParts = useMemo(() => {
    if (!currentFolderPath) return [];
    return currentFolderPath.split('/').filter(Boolean);
  }, [currentFolderPath]);

  const isListView = view !== 'main';

  const renderBreadcrumb = () => {
    if (view !== 'folder') return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.breadcrumb} contentContainerStyle={styles.breadcrumbContent}>
        <TouchableOpacity onPress={() => navigateToFolder('')}>
          <Text style={[styles.crumb, { color: !currentFolderPath ? colors.primary : colors.textSecondary }]}>{parsedRepo?.repo}</Text>
        </TouchableOpacity>
        {pathParts.map((part, i) => (
          <View key={`crumb-${part}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.crumbSep, { color: colors.textSecondary }]}> / </Text>
            <TouchableOpacity onPress={() => navigateToFolder(pathParts.slice(0, i + 1).join('/'))}>
              <Text style={[styles.crumb, { color: i === pathParts.length - 1 ? colors.primary : colors.textSecondary }]}>{part}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={handleClose}
      bottomSheet
      dismissOnBackdrop={false}
      contentStyle={isListView ? { height: '85%' } : undefined}
    >
      <SafeAreaView edges={['bottom']} style={isListView ? styles.sheetFill : styles.sheetAuto}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          {isListView ? (
            <TouchableOpacity onPress={() => setView('main')} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}
          <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
            {view === 'repo' ? 'Select Repository' : view === 'branch' ? 'Select Branch' : view === 'folder' ? 'Select Folder' : 'Git Context'}
          </Text>
          <TouchableOpacity onPress={handleClose}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {view === 'main' && (
          <View style={styles.content}>
            <TouchableOpacity style={styles.selector} onPress={goToRepoView}>
              <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Repository</Text>
              <View style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: repoPath ? colors.primary : colors.border }]}>
                <Text style={repoPath ? [styles.valueText, { color: colors.text }] : [styles.placeholderText, { color: colors.textSecondary }]}>
                  {repoPath || 'Select repository'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>

            {repoPath && (
              <TouchableOpacity style={styles.selector} onPress={goToBranchView}>
                <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Branch</Text>
                <View style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: branch ? colors.primary : colors.border }]}>
                  <Text style={branch ? [styles.valueText, { color: colors.text }] : [styles.placeholderText, { color: colors.textSecondary }]}>
                    {branch || 'Select branch'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            )}

            {repoPath && branch && (
              <TouchableOpacity style={styles.selector} onPress={goToFolderView}>
                <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Folder</Text>
                <View style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: folderPath ? colors.primary : colors.border }]}>
                  <Text style={folderPath ? [styles.valueText, { color: colors.text }] : [styles.placeholderText, { color: colors.textSecondary }]}>
                    {folderPath || 'Select folder (root)'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            )}

            {(repoPath || branch || folderPath) && (
              <TouchableOpacity style={styles.clearButton} onPress={() => onSelect(null, null, null)}>
                <Ionicons name="trash-outline" size={16} color={colors.error} />
                <Text style={[styles.clearButtonText, { color: colors.error }]}>Clear Selection</Text>
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
                    style={[styles.listItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleRepoSelect(item.path)}
                  >
                    <Ionicons name="folder" size={20} color={colors.primary} />
                    <View style={styles.listItemInfo}>
                      <Text style={[styles.listItemText, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.listItemSub, { color: colors.textSecondary }]} numberOfLines={1}>
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
                style={[styles.useButton, { backgroundColor: colors.primary }, !branchInput.trim() && styles.useButtonDisabled]}
                onPress={handleCustomBranch}
                disabled={!branchInput.trim()}
              >
                <Text style={styles.useButtonText}>Use</Text>
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
                    style={[styles.listItem, { borderBottomColor: colors.border }, item.isCurrent && { backgroundColor: colors.surfaceSecondary }]}
                    onPress={() => handleBranchSelect(item.name)}
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

        {view === 'folder' && (
          <>
            <View style={[styles.folderHeader, { borderBottomColor: colors.border }]}>
              {currentFolderPath ? (
                <TouchableOpacity onPress={navigateUp} style={styles.backArrow}>
                  <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => setShowNewFolderModal(true)}
                style={styles.newFolderBtn}
              >
                <Ionicons name="folder-outline" size={18} color={colors.primary} />
                <Text style={[styles.newFolderBtnText, { color: colors.primary }]}>New Folder</Text>
              </TouchableOpacity>
            </View>
            {renderBreadcrumb()}
            {isLoadingFolders ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : (
              <FlatList
                data={folderItems}
                keyExtractor={(item) => item.path}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
                contentContainerStyle={folderItems.length === 0 ? styles.emptyList : styles.listContent}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.listItem, { borderBottomColor: colors.border }]}
                    onPress={() => item.type === 'dir' ? navigateToFolder(item.path) : handleFolderSelect(item.path)}
                  >
                    <Ionicons
                      name={item.type === 'dir' ? 'folder' : 'document-text'}
                      size={20}
                      color={item.type === 'dir' ? '#FF9500' : colors.primary}
                    />
                    <View style={styles.listItemInfo}>
                      <Text style={[styles.listItemText, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                      {item.type === 'dir' && (
                        <Text style={[styles.listItemSub, { color: colors.textSecondary }]} numberOfLines={1}>{item.path}</Text>
                      )}
                    </View>
                    {item.type === 'dir' ? (
                      <View style={styles.chevronContainer}>
                        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => {
                        HapticService.light();
                        handleFolderSelect(item.path);
                      }} style={styles.selectFolderBtn}>
                        <Text style={[styles.selectFolderText, { color: colors.primary }]}>Select</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Ionicons name="folder-open-outline" size={48} color={colors.textSecondary} />
                    <Text style={[styles.emptySubtext, { color: colors.textSecondary, marginTop: 8 }]}>
                      No folders yet. Create one to get started.
                    </Text>
                  </View>
                }
              />
            )}
          </>
        )}

        <Modal visible={showNewFolderModal} onRequestClose={() => { setShowNewFolderModal(false); setNewFolderName(''); }}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>New Folder</Text>
          <TextInput
            style={[styles.modalInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            placeholder="Folder name"
            placeholderTextColor={colors.textSecondary}
            value={newFolderName}
            onChangeText={setNewFolderName}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => { setShowNewFolderModal(false); setNewFolderName(''); }}
            >
              <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.primary }, !newFolderName.trim() && styles.useButtonDisabled]}
              onPress={handleCreateFolder}
              disabled={!newFolderName.trim() || isLoading}
            >
              <Text style={styles.modalBtnText}>Create</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetFill: { flex: 1, paddingBottom: 8 },
  sheetAuto: { paddingBottom: 8 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  selector: { marginBottom: 12 },
  selectorLabel: { fontSize: 12, marginBottom: 4 },
  selectorValue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  valueText: { fontSize: 15, flex: 1 },
  placeholderText: { fontSize: 15, flex: 1 },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 4,
    gap: 4,
  },
  clearButtonText: { fontSize: 14 },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 8,
  },
  backButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 4 },
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
  useButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  useButtonDisabled: { opacity: 0.4 },
  useButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  loader: { padding: 40 },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptySubtext: { fontSize: 14, textAlign: 'center' },
  list: { flex: 1 },
  listContent: { paddingBottom: 16 },
  emptyList: { flexGrow: 1 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  listItemInfo: { flex: 1 },
  listItemText: { fontSize: 15 },
  listItemSub: { fontSize: 12, marginTop: 2 },
  breadcrumb: { maxHeight: 36 },
  breadcrumbContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  crumb: { fontSize: 14, fontWeight: '600' },
  crumbSep: { fontSize: 14 },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backArrow: { padding: 4 },
  newFolderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  newFolderBtnText: { fontSize: 14, fontWeight: '500' },
  selectFolderBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  chevronContainer: { padding: 4 },
  selectFolderText: { fontSize: 13, fontWeight: '500' },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  modalInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 8, marginTop: 16, justifyContent: 'flex-end' },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  modalBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
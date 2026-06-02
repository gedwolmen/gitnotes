import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlatList } from 'react-native';

import { Surface, IconButton, Input } from '../ui';
import { useTokens } from '../../contexts/ThemeContext';
import { AIContextItem } from '../../models/AIProvider';
import { GitHubService } from '../../services/GitHubService';
import { useRepoStore } from '../../stores/repoStore';
import { useNoteStore } from '../../stores/noteStore';
import { useTodoStore } from '../../stores/todoStore';
import { useAIStore } from '../../stores/aiStore';

type TabType = 'files' | 'folders' | 'repo' | 'local-notes' | 'local-todos';
type RepoTreeEntry = { path: string; type: 'blob' | 'tree'; sha: string; size?: number };

export interface ContextPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (items: AIContextItem[]) => void;
  initialSelected?: AIContextItem[];
}

const TABS: { key: TabType; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'files', icon: 'document-outline', label: 'Files' },
  { key: 'folders', icon: 'folder-outline', label: 'Folders' },
  { key: 'repo', icon: 'git-branch-outline', label: 'Repo' },
  { key: 'local-notes', icon: 'journal-outline', label: 'Notes' },
  { key: 'local-todos', icon: 'checkbox-outline', label: 'Todos' },
];

export default function ContextPickerModal({
  visible,
  onClose,
  onConfirm,
  initialSelected = [],
}: ContextPickerModalProps) {
  const { colors, spacing, type, radii } = useTokens();

  const [activeTab, setActiveTab] = useState<TabType>('repo');
  const [selectedItems, setSelectedItems] = useState<AIContextItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [repoTree, setRepoTree] = useState<RepoTreeEntry[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const repos = useRepoStore(s => s.repositories);
  const notes = useNoteStore(s => s.notes);
  const todos = useTodoStore(s => s.todos);
  const chatRepoOwner = useAIStore((s) => s.chatRepoOwner);
  const chatRepoName = useAIStore((s) => s.chatRepoName);
  const chatRepoBranch = useAIStore((s) => s.chatRepoBranch);

  const hasChatRepo = Boolean(chatRepoOwner && chatRepoName);

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (!chatRepoOwner || !chatRepoName) {
      setRepoTree([]);
      setTreeError(null);
      setTreeLoading(false);
      return;
    }

    let cancelled = false;

    const loadTree = async () => {
      setTreeLoading(true);
      setTreeError(null);

      try {
        const tree = await GitHubService.getTreeRecursive(chatRepoOwner, chatRepoName, chatRepoBranch || 'main');
        if (!cancelled) {
          setRepoTree(tree);
        }
      } catch (error) {
        if (!cancelled) {
          setRepoTree([]);
          setTreeError(error instanceof Error ? error.message : 'Failed to load repository tree');
        }
      } finally {
        if (!cancelled) {
          setTreeLoading(false);
        }
      }
    };

    void loadTree();

    return () => {
      cancelled = true;
    };
  }, [visible, chatRepoOwner, chatRepoName, chatRepoBranch]);

  useEffect(() => {
    if (visible) {
      setSelectedItems(initialSelected);
      setSearchQuery('');
    }
  }, [visible, initialSelected]);

  const handleConfirm = useCallback(() => {
    onConfirm(selectedItems);
  }, [selectedItems, onConfirm]);

  const toggleSelection = useCallback((item: AIContextItem) => {
    setSelectedItems(prev => {
      const exists = prev.find(i => i.type === item.type && i.path === item.path);
      if (exists) {
        return prev.filter(i => !(i.type === item.type && i.path === item.path));
      }
      return [...prev, item];
    });
  }, []);

  const isSelected = useCallback((type: string, path: string) => {
    return selectedItems.some(i => i.type === type && i.path === path);
  }, [selectedItems]);

  const searchTerm = searchQuery.trim().toLowerCase();

  const filteredFiles = repoTree
    .filter((item) => item.type === 'blob')
    .filter((item) => !searchTerm || item.path.toLowerCase().includes(searchTerm) || item.path.split('/').pop()?.toLowerCase().includes(searchTerm))
    .sort((a, b) => a.path.localeCompare(b.path));

  const filteredFolders = repoTree
    .filter((item) => item.type === 'tree')
    .filter((item) => !searchTerm || item.path.toLowerCase().includes(searchTerm) || item.path.split('/').pop()?.toLowerCase().includes(searchTerm))
    .sort((a, b) => a.path.localeCompare(b.path));

  const makeContextItem = useCallback((type: 'file' | 'folder', path: string, name: string): AIContextItem => {
    let approxBytes: number | undefined;
    if (type === 'file') {
      const entry = repoTree.find((e) => e.type === 'blob' && e.path === path);
      approxBytes = entry?.size;
    } else if (type === 'folder') {
      approxBytes = repoTree
        .filter((e) => e.type === 'blob' && e.path.startsWith(`${path}/`))
        .reduce((acc, e) => acc + (e.size || 0), 0) || undefined;
    }
    return {
      type,
      owner: chatRepoOwner || '',
      repo: chatRepoName || '',
      path,
      name,
      branch: chatRepoBranch || 'main',
      approxBytes,
    };
  }, [chatRepoBranch, chatRepoName, chatRepoOwner, repoTree]);

  const renderEmptyState = (icon: keyof typeof Ionicons.glyphMap, title: string, subtitle: string) => (
    <View style={styles.placeholderContainer}>
      <Ionicons name={icon} size={48} color={colors.textSecondary} />
      <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>{title}</Text>
      <Text style={[styles.placeholderSub, { color: colors.textSecondary }]}>{subtitle}</Text>
    </View>
  );

  const renderFiles = () => (
    treeLoading ? (
      <View style={styles.placeholderContainer}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>Loading files…</Text>
      </View>
    ) : treeError ? (
      renderEmptyState('alert-circle-outline', 'Files unavailable', treeError)
    ) : !hasChatRepo ? (
      renderEmptyState('document-text-outline', 'Connect a chat repo', 'Files appear after a repository is selected')
    ) : (
      <FlatList
        data={filteredFiles}
        keyExtractor={(item) => item.path}
        contentContainerStyle={listContentContainerStyle}
        ListEmptyComponent={renderEmptyState('document-text-outline', 'No files found', 'Try a different search or repository')}
        renderItem={({ item }) => {
          const name = item.path.split('/').pop() || item.path;
          const selected = isSelected('file', item.path);
          return (
            <TouchableOpacity testID="context-picker.button.toggle" activeOpacity={0.7} onPress={() => toggleSelection(makeContextItem('file', item.path, name))}>
              <Surface
                elevation={selected ? 'flat' : 'raised'}
                radius="md"
                style={[
                  styles.listItem,
                  { marginBottom: spacing[4] },
                  selected && { backgroundColor: colors.surfaceSecondary, borderColor: colors.accent, borderWidth: 1 },
                ]}
              >
                <View style={styles.listRow}>
                  <Surface elevation="flat" radius="sm" style={{ padding: spacing[2], backgroundColor: colors.bg }}>
                    <Ionicons name="document-outline" size={24} color={colors.text} />
                  </Surface>
                  <View style={styles.listTextContainer}>
                    <Text style={[styles.listTitle, { color: colors.text, fontSize: type.md }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.listSub, { color: colors.textSecondary, fontSize: type.sm }]} numberOfLines={1}>
                      {item.path}
                    </Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={24} color={colors.accent} />}
                </View>
              </Surface>
            </TouchableOpacity>
          );
        }}
      />
    )
  );

  const renderFolders = () => (
    treeLoading ? (
      <View style={styles.placeholderContainer}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>Loading folders…</Text>
      </View>
    ) : treeError ? (
      renderEmptyState('alert-circle-outline', 'Folders unavailable', treeError)
    ) : !hasChatRepo ? (
      renderEmptyState('folder-open-outline', 'Connect a chat repo', 'Folders appear after a repository is selected')
    ) : (
      <FlatList
        data={filteredFolders}
        keyExtractor={(item) => item.path}
        contentContainerStyle={listContentContainerStyle}
        ListEmptyComponent={renderEmptyState('folder-open-outline', 'No folders found', 'Try a different search or repository')}
        renderItem={({ item }) => {
          const name = item.path.split('/').pop() || item.path;
          const selected = isSelected('folder', item.path);
          return (
            <TouchableOpacity activeOpacity={0.7} onPress={() => toggleSelection(makeContextItem('folder', item.path, name))}>
              <Surface
                elevation={selected ? 'flat' : 'raised'}
                radius="md"
                style={[
                  styles.listItem,
                  { marginBottom: spacing[4] },
                  selected && { backgroundColor: colors.surfaceSecondary, borderColor: colors.accent, borderWidth: 1 },
                ]}
              >
                <View style={styles.listRow}>
                  <Surface elevation="flat" radius="sm" style={{ padding: spacing[2], backgroundColor: colors.bg }}>
                    <Ionicons name="folder-outline" size={24} color={colors.text} />
                  </Surface>
                  <View style={styles.listTextContainer}>
                    <Text style={[styles.listTitle, { color: colors.text, fontSize: type.md }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.listSub, { color: colors.textSecondary, fontSize: type.sm }]} numberOfLines={1}>
                      {item.path}
                    </Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={24} color={colors.accent} />}
                </View>
              </Surface>
            </TouchableOpacity>
          );
        }}
      />
    )
  );

  const renderRepos = () => (
      <FlatList
        data={repos}
        keyExtractor={item => item.path}
      contentContainerStyle={listContentContainerStyle}
      renderItem={({ item }) => {
        const selected = isSelected('repo', item.path);
        return (
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => toggleSelection({
              type: 'repo',
              owner: chatRepoOwner || '',
              repo: item.name,
              path: item.path,
              name: item.name,
              branch: chatRepoBranch || 'main',
              approxBytes: repoTree.filter((e) => e.type === 'blob').reduce((acc, e) => acc + (e.size || 0), 0) || undefined,
            })}
          >
            <Surface 
              elevation={selected ? 'flat' : 'raised'} 
              radius="md"
              style={[
                styles.listItem, 
                { marginBottom: spacing[4] },
                selected && { backgroundColor: colors.surfaceSecondary, borderColor: colors.accent, borderWidth: 1 }
              ]}
            >
              <View style={styles.listRow}>
                <Surface elevation="flat" radius="sm" style={{ padding: spacing[2], backgroundColor: colors.bg }}>
                  <Ionicons name="git-branch-outline" size={24} color={colors.text} />
                </Surface>
                <View style={styles.listTextContainer}>
                  <Text style={[styles.listTitle, { color: colors.text, fontSize: type.md }]}>{item.name}</Text>
                  <Text style={[styles.listSub, { color: colors.textSecondary, fontSize: type.sm }]} numberOfLines={1}>
                    {item.path}
                  </Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={24} color={colors.accent} />}
              </View>
            </Surface>
          </TouchableOpacity>
        );
      }}
    />
  );

  const renderNotes = () => {
    const filteredNotes = notes.filter(n => 
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      n.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <FlatList
        data={filteredNotes}
        keyExtractor={item => item.id}
        contentContainerStyle={listContentContainerStyle}
        renderItem={({ item }) => {
          const selected = isSelected('local-notes', item.id);
          return (
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => toggleSelection({
                type: 'local-notes',
                owner: '',
                repo: '',
                path: item.id,
                name: item.title,
                approxBytes: (item.title?.length || 0) + (item.content?.length || 0),
              })}
            >
              <Surface 
                elevation={selected ? 'flat' : 'raised'} 
                radius="md"
                style={[
                  styles.listItem, 
                  { marginBottom: spacing[4] },
                  selected && { backgroundColor: colors.surfaceSecondary, borderColor: colors.accent, borderWidth: 1 }
                ]}
              >
                <View style={styles.listRow}>
                  <Surface elevation="flat" radius="sm" style={{ padding: spacing[2], backgroundColor: colors.bg }}>
                    <Ionicons name="journal-outline" size={24} color={colors.text} />
                  </Surface>
                  <View style={styles.listTextContainer}>
                    <Text style={[styles.listTitle, { color: colors.text, fontSize: type.md }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.listSub, { color: colors.textSecondary, fontSize: type.sm }]}>
                      {new Date(item.updatedAt).toLocaleDateString()}
                      {item.tags?.length ? ` • ${item.tags.join(', ')}` : ''}
                    </Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={24} color={colors.accent} />}
                </View>
              </Surface>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  const renderTodos = () => {
    const filteredTodos = todos.filter(t => 
      t.text.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const sortedTodos = [...filteredTodos].sort((a, b) => {
      if (a.completed === b.completed) return b.createdAt - a.createdAt;
      return a.completed ? 1 : -1;
    });

    return (
      <FlatList
        data={sortedTodos}
        keyExtractor={item => item.id}
        contentContainerStyle={listContentContainerStyle}
        renderItem={({ item }) => {
          const selected = isSelected('local-todos', item.id);
          return (
            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={() => toggleSelection({
                type: 'local-todos',
                owner: '',
                repo: '',
                path: item.id,
                name: item.text,
                approxBytes: (item.text?.length || 0)
              })}
            >
              <Surface 
                elevation={selected ? 'flat' : 'raised'} 
                radius="md"
                style={[
                  styles.listItem, 
                  { marginBottom: spacing[4] },
                  selected && { backgroundColor: colors.surfaceSecondary, borderColor: colors.accent, borderWidth: 1 }
                ]}
              >
                <View style={styles.listRow}>
                  <Surface elevation="flat" radius="sm" style={{ padding: spacing[2], backgroundColor: colors.bg }}>
                    <Ionicons 
                      name={item.completed ? "checkbox" : "square-outline"} 
                      size={24} 
                      color={item.completed ? colors.textSecondary : colors.text} 
                    />
                  </Surface>
                  <View style={styles.listTextContainer}>
                    <Text 
                      style={[
                        styles.listTitle, 
                        { color: item.completed ? colors.textSecondary : colors.text, fontSize: type.md },
                        item.completed && { textDecorationLine: 'line-through' }
                      ]} 
                      numberOfLines={2}
                    >
                      {item.text}
                    </Text>
                    {item.priority && (
                      <Text style={[styles.listSub, { color: colors.textSecondary, fontSize: type.sm }]}>
                        Priority: {item.priority}
                      </Text>
                    )}
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={24} color={colors.accent} />}
                </View>
              </Surface>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'files': return renderFiles();
      case 'folders': return renderFolders();
      case 'repo': return renderRepos();
      case 'local-notes': return renderNotes();
      case 'local-todos': return renderTodos();
      default: return null;
    }
  };

  const showSearch = activeTab === 'files' || activeTab === 'folders' || activeTab === 'local-notes' || activeTab === 'local-todos';
  const selectedCountLabel = `${selectedItems.length} ${selectedItems.length === 1 ? 'item' : 'items'} selected`;
  const listContentContainerStyle = {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
    paddingTop: spacing[2],
  } as const;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={[styles.chrome, { borderBottomColor: colors.border }]}>
            <View style={[styles.headerRow, { paddingHorizontal: spacing[4], paddingTop: spacing[3] }]}> 
              <IconButton size="sm" onPress={onClose} accessibilityLabel="Back">
                <Ionicons name="arrow-back" size={18} color={colors.accent} />
              </IconButton>

              <View style={styles.headerTextWrap}>
                <Text style={[styles.headerTitle, { color: colors.text, fontSize: type['2xl'] }]} numberOfLines={1}>
                  Select Context
                </Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary, fontSize: type.sm }]} numberOfLines={1}>
                  {selectedCountLabel}
                </Text>
              </View>

              <TouchableOpacity
                testID="context-picker.button.confirm"
                activeOpacity={0.8}
                onPress={selectedItems.length === 0 ? undefined : handleConfirm}
                disabled={selectedItems.length === 0}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Surface
                  elevation="raised"
                  radius="pill"
                  style={[
                    styles.doneButton,
                    { backgroundColor: colors.surface },
                    selectedItems.length === 0 && styles.disabledAction,
                  ]}
                >
                  <Text
                    style={[
                      styles.doneButtonText,
                      { color: selectedItems.length === 0 ? colors.textSecondary : colors.text, fontSize: type.md },
                    ]}
                  >
                    Done
                  </Text>
                </Surface>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabsScroller}
              contentContainerStyle={[styles.tabBar, { paddingHorizontal: spacing[4] }]}
            >
              {TABS.map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    testID="context-picker.tab.switch"
                    style={[
                      styles.tabItem,
                      { borderRadius: radii.pill },
                      isActive && { backgroundColor: colors.surface },
                    ]}
                    onPress={() => setActiveTab(tab.key)}
                    accessibilityLabel={tab.label}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={(isActive ? tab.icon.replace('-outline', '') : tab.icon) as keyof typeof Ionicons.glyphMap}
                      size={18}
                      color={isActive ? colors.text : colors.textSecondary}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: type.sm,
                        fontWeight: isActive ? '600' : '500',
                        color: isActive ? colors.text : colors.textSecondary,
                      }}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {showSearch && (
              <View style={{ paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[2] }}>
                <Input
                  testID="context-picker.input.search"
                  placeholder="Search..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  leading={<Ionicons name="search" size={20} color={colors.textSecondary} />}
                  autoCapitalize="none"
                />
              </View>
            )}
          </View>

          <KeyboardAvoidingView 
            style={styles.contentContainer} 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {renderContent()}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  chrome: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 2,
  },
  doneButton: {
    minHeight: 36,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    fontWeight: '600',
    lineHeight: 20,
  },
  disabledAction: {
    opacity: 0.45,
  },
  tabsScroller: {
    flexGrow: 0,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
  },
  contentContainer: {
    flex: 1,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  placeholderSub: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  listItem: {
    padding: 12,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  listTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  listSub: {
    fontWeight: '400',
  }
});

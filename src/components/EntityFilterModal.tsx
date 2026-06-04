import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Modal } from './ui';
import { useTheme } from '../contexts/ThemeContext';
import { HapticService } from '../utils/haptics';
import { GitRepository } from '../services/GitService';
import { FilterableItem, UseEntityFilterReturn } from '../hooks/useEntityFilter';
import { useAuth } from '../contexts/AuthContext';
import { FolderTree, buildFolderHierarchy } from './notes/notesShared';

interface Props<T extends FilterableItem> {
  visible: boolean;
  onClose: () => void;
  filter: UseEntityFilterReturn<T>;
  repositories: GitRepository[];
}

export function EntityFilterModal<T extends FilterableItem>(props: Props<T>) {
  const { visible, onClose, filter, repositories } = props;
  const { colors } = useTheme();
  const { accounts } = useAuth();
  const showAccountFilter = accounts.length >= 2;
  const {
    state,
    setSelectedRepo,
    setSelectedBranch,
    setSelectedFolder,
    setSelectedAccountId,
    toggleTag,
    clearAll,
    allBranches,
    allFolders,
    allTags,
    activeCount,
  } = filter;
  const { selectedRepo, selectedBranch, selectedFolder, selectedTags, selectedAccountId } = state;

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const folderHierarchy = useMemo(() => buildFolderHierarchy(allFolders), [allFolders]);

  const toggleExpanded = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderChipRow = (
    items: string[],
    selected: string | null,
    setSelected: (v: string | null) => void,
    iconName: keyof typeof Ionicons.glyphMap,
  ) => (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipRow}
      data={items}
      keyExtractor={(item) => item}
      ListHeaderComponent={
        <TouchableOpacity
          style={[
            styles.chip,
            { borderColor: colors.border },
            !selected && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
          ]}
          onPress={() => setSelected(null)}
        >
          <Text style={[styles.chipText, { color: !selected ? colors.primary : colors.text }]}>
            All
          </Text>
        </TouchableOpacity>
      }
      renderItem={({ item }) => {
        const isSelected = selected === item;
        return (
          <TouchableOpacity
            style={[
              styles.chip,
              { borderColor: colors.border },
              isSelected && {
                borderColor: colors.primary,
                backgroundColor: colors.primary + '15',
              },
            ]}
            onPress={() => {
              HapticService.selection();
              setSelected(isSelected ? null : item);
            }}
          >
            <Ionicons
              name={iconName}
              size={13}
              color={isSelected ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[styles.chipText, { color: isSelected ? colors.primary : colors.text }]}
              numberOfLines={1}
            >
              {item}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );

  const renderFolderTree = (folders: FolderTree[], level: number = 0): React.ReactNode => {
    return folders.map(folder => {
      const isExpanded = expandedFolders.has(folder.path);
      const hasChildren = folder.children.length > 0;
      const isSelected = selectedFolder === folder.path;

      return (
        <View key={folder.path}>
          <View style={[styles.folderRow, level > 0 && { paddingLeft: 16 + level * 16 }]}>
            {hasChildren && (
              <TouchableOpacity onPress={() => toggleExpanded(folder.path)} style={styles.expandButton}>
                <Ionicons
                  name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                  size={14}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
            {!hasChildren && <View style={{ width: 0 }} />}
            <TouchableOpacity
              style={[
                styles.chip,
                { borderColor: colors.border },
                isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
              ]}
              onPress={() => {
                HapticService.selection();
                setSelectedFolder(isSelected ? null : folder.path);
              }}
            >
              <Ionicons
                name={isExpanded ? 'folder-open' : 'folder-outline'}
                size={13}
                color={isSelected ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[styles.chipText, { color: isSelected ? colors.primary : colors.text }]}
                numberOfLines={1}
              >
                {folder.name}
              </Text>
            </TouchableOpacity>
          </View>
          {isExpanded && hasChildren && renderFolderTree(folder.children, level + 1)}
        </View>
      );
    });
  };

  return (
    <Modal visible={visible} onRequestClose={onClose} bottomSheet contentStyle={{ height: '85%' }}>
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.backButton} />
          <Text style={[styles.title, { color: colors.text }]}>Filters</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {showAccountFilter && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Account</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipRow}
                data={accounts}
                keyExtractor={(acc) => acc.id}
                ListHeaderComponent={
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      { borderColor: colors.border },
                      !selectedAccountId && {
                        borderColor: colors.primary,
                        backgroundColor: colors.primary + '15',
                      },
                    ]}
                    onPress={() => setSelectedAccountId(null)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: !selectedAccountId ? colors.primary : colors.text },
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                }
                renderItem={({ item: acc }) => {
                  const isSelected = selectedAccountId === acc.id;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        { borderColor: colors.border },
                        isSelected && {
                          borderColor: colors.primary,
                          backgroundColor: colors.primary + '15',
                        },
                      ]}
                      onPress={() => {
                        HapticService.selection();
                        setSelectedAccountId(isSelected ? null : acc.id);
                      }}
                    >
                      <Ionicons
                        name="person-outline"
                        size={13}
                        color={isSelected ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          { color: isSelected ? colors.primary : colors.text },
                        ]}
                        numberOfLines={1}
                      >
                        @{acc.login}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Repository</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
            data={repositories}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              <TouchableOpacity
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  !selectedRepo && {
                    borderColor: colors.primary,
                    backgroundColor: colors.primary + '15',
                  },
                ]}
                onPress={() => setSelectedRepo(null)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: !selectedRepo ? colors.primary : colors.text },
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
            }
            renderItem={({ item: repo }) => {
              const isSelected = selectedRepo?.id === repo.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.chip,
                    { borderColor: colors.border },
                    isSelected && {
                      borderColor: colors.primary,
                      backgroundColor: colors.primary + '15',
                    },
                  ]}
                  onPress={() => {
                    HapticService.selection();
                    setSelectedRepo(isSelected ? null : repo);
                  }}
                >
                  <Ionicons
                    name="logo-github"
                    size={13}
                    color={isSelected ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? colors.primary : colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {repo.name}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />

          {selectedRepo && allBranches.length > 0 && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Branch</Text>
              {renderChipRow(allBranches, selectedBranch, setSelectedBranch, 'git-branch-outline')}
            </>
          )}

          {allFolders.length > 0 && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Folder</Text>
              <View style={styles.folderTreeContainer}>
                <TouchableOpacity
                  style={[
                    styles.chip,
                    { borderColor: colors.border },
                    !selectedFolder && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                  ]}
                  onPress={() => {
                    HapticService.selection();
                    setSelectedFolder(null);
                  }}
                >
                  <Ionicons
                    name="home-outline"
                    size={13}
                    color={!selectedFolder ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.chipText, { color: !selectedFolder ? colors.primary : colors.text }]}>
                    All
                  </Text>
                </TouchableOpacity>
                {renderFolderTree(folderHierarchy)}
              </View>
            </>
          )}

          {allTags.length > 0 && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Tags</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipRow}
                data={allTags}
                keyExtractor={(tag) => tag}
                renderItem={({ item: tag }) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        { borderColor: colors.border },
                        isSelected && {
                          borderColor: colors.primary,
                          backgroundColor: colors.primary + '15',
                        },
                      ]}
                      onPress={() => {
                        HapticService.selection();
                        toggleTag(tag);
                      }}
                    >
                      <Ionicons
                        name="pricetag-outline"
                        size={13}
                        color={isSelected ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          { color: isSelected ? colors.primary : colors.text },
                        ]}
                        numberOfLines={1}
                      >
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.footerButton, { borderColor: colors.border }]}
            onPress={clearAll}
            disabled={activeCount === 0}
          >
            <Text
              style={[
                styles.footerButtonText,
                { color: activeCount === 0 ? colors.textSecondary : colors.text },
              ]}
            >
              Clear all
            </Text>
          </TouchableOpacity>
           <TouchableOpacity
             testID="entity-filter-modal.filter.apply"
             style={[styles.footerButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
             onPress={onClose}
          >
            <Text style={[styles.footerButtonText, { color: '#fff' }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 8,
  },
  backButton: {
    width: 24,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  content: {
    paddingBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  chipRow: {
    paddingHorizontal: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 4,
    maxWidth: 220,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  footerButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  footerButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  folderTreeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    paddingHorizontal: 12,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
expandButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

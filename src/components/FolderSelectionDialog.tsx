import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Folder } from '../models/Folder';
import { useTheme } from '../contexts/ThemeContext';
import { useFolders } from '../contexts/FolderContext';
import { HapticService } from '../utils/haptics';
import { NModal } from './neumorphic';

interface FolderSelectionDialogProps {
  visible: boolean;
  selectedFolderId: string | null;
  onSelect: (folder: Folder | null) => void;
  onClose: () => void;
  additionalFolders?: Folder[];
}

export default function FolderSelectionDialog({
  visible,
  selectedFolderId,
  onSelect,
  onClose,
  additionalFolders = [],
}: FolderSelectionDialogProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { folders: localFolders, createFolder } = useFolders();
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const folders = useMemo(
    () => {
      const mergedByPath = new Map<string, Folder>();
      localFolders.forEach((folder) => {
        mergedByPath.set(folder.path, folder);
      });
      additionalFolders.forEach((folder) => {
        if (!mergedByPath.has(folder.path)) {
          mergedByPath.set(folder.path, folder);
        }
      });
      return Array.from(mergedByPath.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
    [localFolders, additionalFolders]
  );

  const rootFolders = useMemo(
    () => folders.filter((f) => f.parentId === null),
    [folders]
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, Folder[]>();
    folders.forEach((f) => {
      const key = f.parentId ?? '__root__';
      const arr = map.get(key);
      if (arr) arr.push(f);
      else map.set(key, [f]);
    });
    return map;
  }, [folders]);

  const getChildFolders = useCallback(
    (parentId: string | null): Folder[] => {
      return childrenByParent.get(parentId ?? '__root__') ?? [];
    },
    [childrenByParent]
  );

  useEffect(() => {
    if (!visible) return;
    if (!selectedFolderId) return;
    const byId = new Map(folders.map((f) => [f.id, f]));
    const ancestors = new Set<string>();
    let cur = byId.get(selectedFolderId);
    while (cur && cur.parentId) {
      ancestors.add(cur.parentId);
      cur = byId.get(cur.parentId);
    }
    if (ancestors.size === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      ancestors.forEach((id) => next.add(id));
      return next;
    });
  }, [visible, selectedFolderId, folders]);

  const toggleExpand = useCallback((id: string) => {
    HapticService.light();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    HapticService.light();
    setExpanded(new Set(folders.filter((f) => getChildFolders(f.id).length > 0).map((f) => f.id)));
  }, [folders, getChildFolders]);

  const collapseAll = useCallback(() => {
    HapticService.light();
    setExpanded(new Set());
  }, []);

  const handleSelect = useCallback(
    (folder: Folder | null) => {
      HapticService.light();
      onSelect(folder);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }

    HapticService.medium();
    setIsCreating(true);
    try {
      const folder = await createFolder({
        name: newFolderName.trim(),
        parentId: selectedParentId,
      });
      if (folder) {
        setNewFolderName('');
        setSelectedParentId(null);
        setIsCreating(false);
        HapticService.success();
      }
    } catch (error) {
      HapticService.error();
      Alert.alert('Error', 'Failed to create folder');
    }
  }, [newFolderName, selectedParentId, createFolder]);

  const toggleCreateMode = useCallback(() => {
    HapticService.light();
    setIsCreating(!isCreating);
    if (!isCreating) {
      setNewFolderName('');
      setSelectedParentId(null);
    }
  }, [isCreating]);

  const renderFolderItem = useCallback(
    (folder: Folder, level: number = 0): React.ReactElement => {
      const children = getChildFolders(folder.id);
      const hasChildren = children.length > 0;
      const isSelected = selectedFolderId === folder.id;
      const isExpanded = expanded.has(folder.id);

      return (
        <View key={folder.id}>
          <View
            style={[
              styles.folderRow,
              { backgroundColor: isSelected ? colors.primary + '20' : 'transparent' },
              { paddingLeft: 8 + level * 16 },
            ]}
          >
            <TouchableOpacity
              onPress={() => hasChildren && toggleExpand(folder.id)}
              hitSlop={8}
              style={styles.chevronButton}
              activeOpacity={hasChildren ? 0.6 : 1}
            >
              {hasChildren ? (
                <Ionicons
                  name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                  size={16}
                  color={colors.textSecondary}
                />
              ) : (
                <View style={styles.chevronSpacer} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.folderRowMain}
              onPress={() => handleSelect(folder)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={hasChildren && isExpanded ? 'folder-open' : 'folder'}
                size={20}
                color={isSelected ? colors.primary : colors.textSecondary}
                style={styles.folderIcon}
              />
              <Text
                style={[
                  styles.folderName,
                  { color: isSelected ? colors.primary : colors.text },
                ]}
                numberOfLines={1}
              >
                {folder.name}
              </Text>
              {hasChildren && (
                <Text style={[styles.childCount, { color: colors.textSecondary }]}>
                  {children.length}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          {isExpanded && children.map((child) => renderFolderItem(child, level + 1))}
        </View>
      );
    },
    [getChildFolders, selectedFolderId, colors, handleSelect, expanded, toggleExpand]
  );

  return (
    <NModal
      visible={visible}
      onRequestClose={onClose}
      fullWidth
      contentStyle={styles.modalContent}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}> 
          <View style={styles.headerSide}>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.headerActionButton}>
              <Text style={[styles.headerButton, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <Text
            style={[
              styles.headerTitle,
              { color: colors.text, paddingTop: Platform.OS === 'android' ? Math.max(insets.top * 0.2, 0) : 0 },
            ]}
            numberOfLines={1}
          >
            Select Folder
          </Text>
          <View style={styles.headerSide}>
            <TouchableOpacity onPress={toggleCreateMode} hitSlop={8} style={styles.headerActionButton}>
            <Ionicons
              name={isCreating ? 'close' : 'add'}
              size={24}
              color={colors.primary}
            />
            </TouchableOpacity>
          </View>
        </View>

        {isCreating && (
          <View style={[styles.createContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text }]}
              placeholder="Folder name"
              placeholderTextColor={colors.textSecondary}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
              maxLength={50}
            />
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: colors.primary }]}
              onPress={handleCreateFolder}
              disabled={!newFolderName.trim()}
            >
              <Text style={styles.createButtonText}>Create</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={[
              styles.folderItem,
              { backgroundColor: selectedFolderId === null ? colors.primary + '20' : 'transparent' },
            ]}
            onPress={() => handleSelect(null)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="home"
              size={20}
              color={selectedFolderId === null ? colors.primary : colors.textSecondary}
              style={styles.folderIcon}
            />
            <Text
              style={[
                styles.folderName,
                { color: selectedFolderId === null ? colors.primary : colors.text },
              ]}
            >
              All Notes (Root)
            </Text>
          </TouchableOpacity>

          {rootFolders.length > 0 && (
            <View style={styles.treeActionsRow}>
              <TouchableOpacity onPress={expandAll} hitSlop={6} style={styles.treeActionBtn}>
                <Ionicons name="chevron-down" size={12} color={colors.primary} />
                <Text style={[styles.treeActionText, { color: colors.primary }]}>Expand all</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={collapseAll} hitSlop={6} style={styles.treeActionBtn}>
                <Ionicons name="chevron-forward" size={12} color={colors.primary} />
                <Text style={[styles.treeActionText, { color: colors.primary }]}>Collapse all</Text>
              </TouchableOpacity>
            </View>
          )}

          {rootFolders.map((folder) => renderFolderItem(folder))}

          {folders.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No folders yet
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Tap + to create your first folder
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </NModal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    padding: 0,
    width: '100%',
    height: '90%',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    minHeight: 56,
  },
  headerSide: {
    width: 72,
    justifyContent: 'center',
  },
  headerActionButton: {
    minHeight: 32,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerButton: {
    fontSize: 16,
  },
  createContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 16,
  },
  createButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 16,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
  },
  folderRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  chevronButton: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronSpacer: {
    width: 16,
    height: 16,
  },
  folderIcon: {
    marginRight: 12,
  },
  folderName: {
    fontSize: 16,
    flex: 1,
  },
  childCount: {
    fontSize: 12,
    marginLeft: 8,
  },
  treeActionsRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  treeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  treeActionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});

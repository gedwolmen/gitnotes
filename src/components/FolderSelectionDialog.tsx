import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Folder } from '../models/Folder';
import { useTheme } from '../contexts/ThemeContext';
import { useFolders } from '../contexts/FolderContext';
import { HapticService } from '../utils/haptics';

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

  const getChildFolders = useCallback(
    (parentId: string | null): Folder[] => {
      return folders.filter((f) => f.parentId === parentId);
    },
    [folders]
  );

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
      const isSelected = selectedFolderId === folder.id;

      return (
        <View key={folder.id}>
          <TouchableOpacity
            style={[
              styles.folderItem,
              { backgroundColor: isSelected ? colors.primary + '20' : 'transparent' },
              { paddingLeft: 16 + level * 16 },
            ]}
            onPress={() => handleSelect(folder)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="folder"
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
          </TouchableOpacity>
          {children.map((child) => renderFolderItem(child, level + 1))}
        </View>
      );
    },
    [getChildFolders, selectedFolderId, colors, handleSelect]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
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

        <View style={styles.listContainer}>
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
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    paddingTop: 8,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
  },
  folderIcon: {
    marginRight: 12,
  },
  folderName: {
    fontSize: 16,
    flex: 1,
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

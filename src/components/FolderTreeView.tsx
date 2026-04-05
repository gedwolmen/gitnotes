import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Folder } from '../models/Folder';
import { useTheme } from '../contexts/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface FolderTreeViewProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (folder: Folder | null) => void;
  onLongPressFolder?: (folder: Folder) => void;
  showRoot?: boolean;
}

interface FolderItemProps {
  folder: Folder;
  allFolders: Folder[];
  level: number;
  selectedFolderId: string | null;
  expandedFolders: Set<string>;
  onToggle: (folderId: string) => void;
  onSelect: (folder: Folder) => void;
  onLongPress?: (folder: Folder) => void;
  colors: any;
}

const FolderItem = ({
  folder,
  allFolders,
  level,
  selectedFolderId,
  expandedFolders,
  onToggle,
  onSelect,
  onLongPress,
  colors,
}: FolderItemProps) => {
  const isExpanded = expandedFolders.has(folder.id);
  const isSelected = selectedFolderId === folder.id;
  
  const childFolders = useMemo(
    () => allFolders.filter((f) => f.parentId === folder.id),
    [allFolders, folder.id]
  );
  const hasChildren = childFolders.length > 0;

  const handleToggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle(folder.id);
  }, [folder.id, onToggle]);

  const handleSelect = useCallback(() => {
    onSelect(folder);
  }, [folder, onSelect]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(folder);
  }, [folder, onLongPress]);

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.folderItem,
          { backgroundColor: isSelected ? colors.primary + '20' : 'transparent' },
          { paddingLeft: 16 + level * 20 },
        ]}
        onPress={handleSelect}
        onLongPress={onLongPress ? handleLongPress : undefined}
        activeOpacity={0.7}
      >
        <View style={styles.folderContent}>
          {hasChildren ? (
            <TouchableOpacity onPress={handleToggle} style={styles.chevronContainer}>
              <Ionicons
                name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.chevronContainer} />
          )}
          <Ionicons
            name={isExpanded ? 'folder-open' : 'folder'}
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
        </View>
      </TouchableOpacity>

      {isExpanded && hasChildren && (
        <View style={styles.childrenContainer}>
          {childFolders.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              allFolders={allFolders}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              onToggle={onToggle}
              onSelect={onSelect}
              onLongPress={onLongPress}
              colors={colors}
            />
          ))}
        </View>
      )}
    </View>
  );
};

export default function FolderTreeView({
  folders,
  selectedFolderId,
  onSelectFolder,
  onLongPressFolder,
  showRoot = true,
}: FolderTreeViewProps) {
  const { colors } = useTheme();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const rootFolders = useMemo(
    () => folders.filter((f) => f.parentId === null),
    [folders]
  );

  const handleToggle = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleSelectFolder = useCallback(
    (folder: Folder) => {
      onSelectFolder(folder);
    },
    [onSelectFolder]
  );

  const handleSelectRoot = useCallback(() => {
    onSelectFolder(null);
  }, [onSelectFolder]);

  return (
    <View style={styles.container}>
      {showRoot && (
        <TouchableOpacity
          style={[
            styles.folderItem,
            { backgroundColor: selectedFolderId === null ? colors.primary + '20' : 'transparent' },
            { paddingLeft: 16 },
          ]}
          onPress={handleSelectRoot}
          activeOpacity={0.7}
        >
          <View style={styles.folderContent}>
            <View style={styles.chevronContainer} />
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
              numberOfLines={1}
            >
              All Notes
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {rootFolders.map((folder) => (
        <FolderItem
          key={folder.id}
          folder={folder}
          allFolders={folders}
          level={0}
          selectedFolderId={selectedFolderId}
          expandedFolders={expandedFolders}
          onToggle={handleToggle}
          onSelect={handleSelectFolder}
          onLongPress={onLongPressFolder}
          colors={colors}
        />
      ))}

      {folders.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No folders yet
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Create a folder to organize your notes
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
  },
  folderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  chevronContainer: {
    width: 20,
    alignItems: 'center',
  },
  folderIcon: {
    marginHorizontal: 8,
  },
  folderName: {
    fontSize: 16,
    flex: 1,
  },
  childrenContainer: {
    overflow: 'hidden',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});
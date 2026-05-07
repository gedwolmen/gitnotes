import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Folder } from '../models/Folder';
import { useTheme } from '../contexts/ThemeContext';
import { DragDropBoundary, useDropTarget } from './dragdrop/DragDropContext';
import { Group, GroupRow, IconButton } from './ui';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface FolderTreeViewProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (folder: Folder | null) => void;
  onLongPressFolder?: (folder: Folder) => void;
  showRoot?: boolean;
  onDropToFolder?: (noteId: string, folder: Folder | null) => void;
  isDragActive?: boolean;
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
  onDrop?: (noteId: string, folder: Folder) => void;
  isDragActive?: boolean;
  colors: any;
}

interface FolderDropZoneProps {
  enabled: boolean;
  onDrop: (noteId: string) => void;
  highlightColor: string;
  children: React.ReactNode;
}

function FolderDropZone({ enabled, onDrop, highlightColor, children }: FolderDropZoneProps) {
  const { ref, onLayout, isActive } = useDropTarget({ enabled, onDrop });

  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      style={[styles.dropZone, isActive && { backgroundColor: highlightColor, borderRadius: 10 }]}
    >
      {children}
    </View>
  );
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
  onDrop,
  isDragActive,
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

  const handleDrop = useCallback((noteId: string) => {
    onDrop?.(noteId, folder);
  }, [folder, onDrop]);

  const folderRow = (
    <GroupRow
      onPress={handleSelect}
      onLongPress={onLongPress ? handleLongPress : undefined}
      style={[
        isSelected && { backgroundColor: colors.primary + '14' },
        { paddingLeft: 16 + level * 20 },
      ]}
      leading={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {hasChildren ? (
            <IconButton size="sm" onPress={handleToggle} accessibilityLabel={isExpanded ? 'Collapse' : 'Expand'}>
              <Ionicons
                name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                size={14}
                color={colors.textSecondary}
              />
            </IconButton>
          ) : (
            <View style={{ width: 36 }} />
          )}
          <Ionicons
            name={isExpanded ? 'folder-open' : 'folder'}
            size={20}
            color={isSelected ? colors.primary : colors.textSecondary}
          />
        </View>
      }
    >
      <Text
        style={[
          styles.folderName,
          { color: isSelected ? colors.primary : colors.text },
        ]}
        numberOfLines={1}
      >
        {folder.name}
      </Text>
    </GroupRow>
  );

  return (
    <View>
      {onDrop ? (
        <FolderDropZone
          enabled={Boolean(isDragActive ?? true)}
          onDrop={handleDrop}
          highlightColor={colors.primary + '12'}
        >
          {folderRow}
        </FolderDropZone>
      ) : (
        folderRow
      )}

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
              onDrop={onDrop}
              isDragActive={isDragActive}
              colors={colors}
            />
          ))}
        </View>
      )}
    </View>
  );
};

function FolderTreeViewContent({
  folders,
  selectedFolderId,
  onSelectFolder,
  onLongPressFolder,
  showRoot = true,
  onDropToFolder,
  isDragActive,
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

  const handleDropToRoot = useCallback((noteId: string) => {
    onDropToFolder?.(noteId, null);
  }, [onDropToFolder]);

  const handleDropToFolder = useCallback((noteId: string, folder: Folder) => {
    onDropToFolder?.(noteId, folder);
  }, [onDropToFolder]);

  const rootFolderRow = (
    <GroupRow
      onPress={handleSelectRoot}
      style={[
        selectedFolderId === null && { backgroundColor: colors.primary + '14' },
        { paddingLeft: 16 },
      ]}
      leading={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 36 }} />
          <Ionicons
            name="home"
            size={20}
            color={selectedFolderId === null ? colors.primary : colors.textSecondary}
          />
        </View>
      }
    >
      <Text
        style={[
          styles.folderName,
          { color: selectedFolderId === null ? colors.primary : colors.text },
        ]}
        numberOfLines={1}
      >
        All Notes
      </Text>
    </GroupRow>
  );

  return (
    <Group>
      {showRoot && (
        onDropToFolder ? (
          <FolderDropZone
            enabled={Boolean(isDragActive ?? true)}
            onDrop={handleDropToRoot}
            highlightColor={colors.primary + '12'}
          >
            {rootFolderRow}
          </FolderDropZone>
        ) : (
          rootFolderRow
        )
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
          onDrop={handleDropToFolder}
          isDragActive={isDragActive}
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
    </Group>
  );
}

export default function FolderTreeView(props: FolderTreeViewProps) {
  return (
    <DragDropBoundary>
      <FolderTreeViewContent {...props} />
    </DragDropBoundary>
  );
}

const styles = StyleSheet.create({
  dropZone: {
    minHeight: 44,
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

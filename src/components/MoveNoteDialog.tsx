import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type IoniconName = keyof typeof Ionicons.glyphMap;
import { useTheme } from '../contexts/ThemeContext';
import { GitHubService, GitHubContent } from '../services/GitHubService';
import { HapticService } from '../utils/haptics';
import { Note, deriveFolderPath } from '../models/Note';
import { parseRepoPath } from '../utils/gitPathParser';
import { DragDropBoundary, useDragDrop, useDropTarget } from './dragdrop/DragDropContext';
import { Modal } from './ui';

interface MoveNoteDialogProps {
  visible: boolean;
  note: Note | null;
  onClose: () => void;
  onMoved: (noteId: string, newFilePath: string, newFolderPath: string | undefined) => void;
}

interface ContentItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha?: string;
}

interface DraggableFileRowProps {
  itemPath: string;
  children: React.ReactNode;
}

function DraggableFileRow({ itemPath, children }: DraggableFileRowProps) {
  const { startDrag, updateDrag, endDrag, cancelDrag } = useDragDrop();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const dragActiveRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const resetPosition = useCallback(() => {
    translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    scale.value = withSpring(1, { damping: 18, stiffness: 220 });
  }, [scale, translateX, translateY]);

  const handleDragStart = useCallback((absoluteX: number, absoluteY: number) => {
    dragActiveRef.current = true;
    setIsDragging(true);
    scale.value = withSpring(1.02, { damping: 18, stiffness: 220 });
    HapticService.light();
    startDrag(itemPath, { x: absoluteX, y: absoluteY });
  }, [itemPath, scale, startDrag]);

  const handleDragUpdate = useCallback((absoluteX: number, absoluteY: number) => {
    if (!dragActiveRef.current) {
      return;
    }

    updateDrag({ x: absoluteX, y: absoluteY });
  }, [updateDrag]);

  const finishDrag = useCallback((shouldDrop: boolean) => {
    if (!dragActiveRef.current) {
      return;
    }

    dragActiveRef.current = false;
    setIsDragging(false);
    if (shouldDrop) {
      endDrag();
    } else {
      cancelDrag();
    }
  }, [cancelDrag, endDrag]);

  const gesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(500)
    .onStart((event) => {
      runOnJS(handleDragStart)(event.absoluteX, event.absoluteY);
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      runOnJS(handleDragUpdate)(event.absoluteX, event.absoluteY);
    })
    .onEnd(() => {
      runOnJS(finishDrag)(true);
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
      translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      scale.value = withSpring(1, { damping: 18, stiffness: 220 });
    })
    .onFinalize(() => {
      runOnJS(finishDrag)(false);
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
      translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      scale.value = withSpring(1, { damping: 18, stiffness: 220 });
    }), [finishDrag, handleDragStart, handleDragUpdate, scale, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: isDragging ? 0.92 : 1,
    zIndex: isDragging ? 100 : 0,
    elevation: isDragging ? 10 : 0,
    shadowColor: '#000',
    shadowOpacity: isDragging ? 0.18 : 0,
    shadowRadius: isDragging ? 10 : 0,
    shadowOffset: { width: 0, height: 6 },
  }), [isDragging]);

  useEffect(() => () => {
    resetPosition();
  }, [resetPosition]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animatedStyle}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

interface DirectoryDropRowProps {
  itemPath: string;
  onDrop: (dragPath: string, targetPath: string) => void;
  highlightColor: string;
  children: React.ReactNode;
}

function DirectoryDropRow({ itemPath, onDrop, highlightColor, children }: DirectoryDropRowProps) {
  const { ref, onLayout, isActive } = useDropTarget({
    onDrop: (dragPath) => {
      if (dragPath !== itemPath) {
        onDrop(dragPath, itemPath);
      }
    },
  });

  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      style={[exploreStyles.dropZone, isActive && { backgroundColor: highlightColor, borderRadius: 10 }]}
    >
      {children}
    </View>
  );
}

interface ListDropContainerProps {
  targetPath: string;
  onDrop: (dragPath: string, targetPath: string) => void;
  highlightColor: string;
  children: React.ReactNode;
}

function ListDropContainer({ targetPath, onDrop, highlightColor, children }: ListDropContainerProps) {
  const { ref, onLayout, isActive } = useDropTarget({
    onDrop: (dragPath) => {
      onDrop(dragPath, targetPath);
    },
  });

  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      style={[exploreStyles.listDropContainer, isActive && { backgroundColor: highlightColor }]}
    >
      {children}
    </View>
  );
}

export default function MoveNoteDialog({ visible, note, onClose, onMoved }: MoveNoteDialogProps) {
  const { colors } = useTheme();
  const [currentPath, setCurrentPath] = useState('');
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const folderInputRef = useRef<TextInput>(null);

  const repoInfo = useMemo(() => {
    if (!note?.repo) return null;
    return parseRepoPath(note.repo);
  }, [note?.repo]);

  const branch = useMemo(() => note?.branch || 'main', [note?.branch]);

  const pathParts = useMemo(() => {
    if (!currentPath) return [];
    return currentPath.split('/').filter(Boolean);
  }, [currentPath]);

  const loadContents = useCallback(async (path: string) => {
    if (!repoInfo) return;
    setIsLoading(true);
    try {
      const items = await GitHubService.getRepoContents(
        repoInfo.owner,
        repoInfo.repo,
        path,
        note?.branch || undefined,
      );
      const sorted = items
        .filter((item: GitHubContent) => item.type === 'dir' || item.type === 'file')
        .map((item: GitHubContent) => ({
          name: item.name,
          path: item.path,
          type: item.type as 'file' | 'dir',
          sha: item.sha,
        }))
        .sort((a: ContentItem, b: ContentItem) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      setContents(sorted);
      setCurrentPath(path);
    } catch (error) {
      console.warn('[MoveNoteDialog] loadContents failed:', error);
      setContents([]);
    } finally {
      setIsLoading(false);
    }
  }, [repoInfo, note?.branch]);

  useEffect(() => {
    if (!visible || !repoInfo) {
      setCurrentPath('');
      setContents([]);
      setIsCreatingFolder(false);
      setNewFolderName('');
      return;
    }
    loadContents('');
  }, [visible, repoInfo, loadContents]);

  const navigateToFolder = useCallback((path: string) => {
    HapticService.light();
    setIsCreatingFolder(false);
    loadContents(path);
  }, [loadContents]);

  const navigateToBreadcrumb = useCallback((index: number) => {
    HapticService.light();
    setIsCreatingFolder(false);
    if (index < 0) {
      loadContents('');
      return;
    }
    const parts = currentPath.split('/').filter(Boolean);
    loadContents(parts.slice(0, index + 1).join('/'));
  }, [currentPath, loadContents]);

  const handleMove = useCallback(async () => {
    if (!note || !repoInfo || !note.filePath) return;

    const fileName = note.filePath.split('/').pop() || 'note.md';
    const newPath = currentPath ? `${currentPath}/${fileName}` : fileName;

    if (newPath === note.filePath) {
      Alert.alert('Same Location', 'This note is already in this folder.');
      return;
    }

    setIsMoving(true);
    try {
      const content = await GitHubService.getFileContent(
        repoInfo.owner, repoInfo.repo, note.filePath, note.branch || undefined,
      );
      if (content === null) {
        Alert.alert('Error', 'Could not read note content from GitHub.');
        setIsMoving(false);
        return;
      }

      const sha = await GitHubService.getFileShaOrNull(
        repoInfo.owner, repoInfo.repo, note.filePath, note.branch || undefined,
      );
      if (!sha) {
        Alert.alert('Error', 'Could not get file SHA from GitHub.');
        setIsMoving(false);
        return;
      }

      const success = await GitHubService.moveFile(
        repoInfo.owner,
        repoInfo.repo,
        note.filePath,
        newPath,
        content,
        `Move ${fileName} to ${currentPath || 'root'}`,
        sha,
        branch,
      );

      if (success) {
        HapticService.success();
        const newFolderPath = deriveFolderPath(newPath);
        onMoved(note.id, newPath, newFolderPath);
        onClose();
      } else {
        Alert.alert('Error', 'Failed to move file on GitHub.');
      }
    } catch (error) {
      console.warn('[MoveNoteDialog] handleMoveNote failed:', error);
      Alert.alert('Error', 'Failed to move note. Please try again.');
    } finally {
      setIsMoving(false);
    }
  }, [note, repoInfo, currentPath, branch, onMoved, onClose]);

  const handleMoveItemToFolder = useCallback(async (itemPath: string, targetFolderPath: string) => {
    if (!repoInfo) return;
    const fileName = itemPath.split('/').pop();
    if (!fileName) return;
    const newPath = targetFolderPath ? `${targetFolderPath}/${fileName}` : fileName;
    if (newPath === itemPath) return;

    try {
      const content = await GitHubService.getFileContent(
        repoInfo.owner, repoInfo.repo, itemPath, note?.branch || undefined,
      );
      if (content === null) return;

      const sha = await GitHubService.getFileShaOrNull(
        repoInfo.owner, repoInfo.repo, itemPath, note?.branch || undefined,
      );
      if (!sha) return;

      const success = await GitHubService.moveFile(
        repoInfo.owner, repoInfo.repo, itemPath, newPath, content,
        `Move ${fileName} to ${targetFolderPath || 'root'}`, sha, branch,
      );

      if (success) {
        HapticService.success();
        if (itemPath === note?.filePath) {
          const newFolderPath = deriveFolderPath(newPath);
          onMoved(note.id, newPath, newFolderPath);
          onClose();
        } else {
          loadContents(currentPath);
        }
      }
    } catch (error) {
      console.warn('[MoveNoteDialog] handleMoveItemToFolder failed:', error);
      Alert.alert('Error', 'Failed to move file.');
    }
  }, [repoInfo, note, branch, currentPath, onMoved, onClose, loadContents]);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || !repoInfo) return;

    const folderPath = currentPath ? `${currentPath}/${name}` : name;
    try {
      await GitHubService.createFolder(repoInfo.owner, repoInfo.repo, folderPath, branch);
      HapticService.success();
      setNewFolderName('');
      setIsCreatingFolder(false);
      Keyboard.dismiss();
      loadContents(currentPath);
    } catch (error) {
      console.warn('[MoveNoteDialog] handleCreateFolder failed:', error);
      Alert.alert('Error', 'Failed to create folder.');
    }
  }, [newFolderName, repoInfo, currentPath, branch, loadContents]);

  const startCreatingFolder = useCallback(() => {
    setIsCreatingFolder(true);
    setTimeout(() => folderInputRef.current?.focus(), 100);
  }, []);

  const cancelCreatingFolder = useCallback(() => {
    setIsCreatingFolder(false);
    setNewFolderName('');
    Keyboard.dismiss();
  }, []);

  const getFileIcon = useCallback((name: string): IoniconName => {
    const ext = name.toLowerCase().split('.').pop();
    switch (ext) {
      case 'md': return 'document-text';
      case 'norg': return 'document-text';
      case 'org': return 'document-text';
      case 'pdf': return 'document-text';
      case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': return 'image';
      default: return 'document';
    }
  }, []);

  const renderItem = useCallback(({ item }: { item: ContentItem }) => {
    const isDir = item.type === 'dir';
    const iconName = isDir ? 'folder' : getFileIcon(item.name);
    const iconColor = isDir ? '#FF9500' : colors.textSecondary;

    const itemContent = (
      <View style={[exploreStyles.item, { borderBottomColor: colors.border + '40' }]}>
        <Ionicons name={iconName} size={22} color={iconColor} style={exploreStyles.itemIcon} />
        <Text style={[exploreStyles.itemName, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        {isDir ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        ) : (
          <Text style={[exploreStyles.itemMeta, { color: colors.textSecondary }]}>
            {item.name.split('.').pop()}
          </Text>
        )}
      </View>
    );

    if (isDir) {
      return (
        <DirectoryDropRow
          itemPath={item.path}
          onDrop={handleMoveItemToFolder}
          highlightColor={colors.primary + '12'}
        >
          <TouchableOpacity
            onPress={() => navigateToFolder(item.path)}
            activeOpacity={0.7}
          >
            {itemContent}
          </TouchableOpacity>
        </DirectoryDropRow>
      );
    }

    return (
      <DraggableFileRow itemPath={item.path}>
        {itemContent}
      </DraggableFileRow>
    );
  }, [colors, navigateToFolder, handleMoveItemToFolder, getFileIcon]);

  const fileName = note?.filePath?.split('/').pop() || 'note.md';

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      fullWidth
      contentStyle={exploreStyles.modalContent}
    >
      <DragDropBoundary>
        <SafeAreaView style={[exploreStyles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
          <View style={[exploreStyles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity testID="move-note.button.close" onPress={onClose} style={exploreStyles.headerBtn}>
              <Text style={[exploreStyles.headerBtnText, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[exploreStyles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              Explore
            </Text>
            <TouchableOpacity
              testID="move-note.button.move"
              onPress={handleMove}
              disabled={isMoving}
              style={exploreStyles.headerBtn}
            >
              {isMoving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[exploreStyles.headerBtnText, { color: colors.primary, fontWeight: '600' }]}>Move</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[exploreStyles.destinationBanner, { backgroundColor: colors.surface }]}>
            <Ionicons name="document-text" size={16} color={colors.primary} />
            <Text style={[exploreStyles.destinationLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              Moving <Text style={{ color: colors.text, fontWeight: '500' }}>{fileName}</Text>
            </Text>
          </View>

          <View style={[exploreStyles.breadcrumbBar, { borderBottomColor: colors.border + '40' }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={exploreStyles.breadcrumb} contentContainerStyle={{ flexGrow: 1 }}>
              <TouchableOpacity onPress={() => navigateToBreadcrumb(-1)}>
                <Text style={[exploreStyles.crumb, { color: !currentPath ? colors.primary : colors.textSecondary }]}>
                  {repoInfo?.repo || 'repo'}
                </Text>
              </TouchableOpacity>
              {pathParts.map((part, i) => (
                <View key={`crumb-${part}-${pathParts.slice(0, i + 1).join('/')}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[exploreStyles.crumbSep, { color: colors.textSecondary }]}> / </Text>
                  <TouchableOpacity onPress={() => navigateToBreadcrumb(i)}>
                    <Text style={[exploreStyles.crumb, { color: i === pathParts.length - 1 ? colors.primary : colors.textSecondary }]}>
                      {part}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={startCreatingFolder}
              style={[exploreStyles.newFolderBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}
            >
              <Ionicons name="add" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {isCreatingFolder && (
            <View style={[exploreStyles.folderInputRow, { backgroundColor: colors.surface, borderBottomColor: colors.border + '40' }]}>
              <Ionicons name="folder-outline" size={20} color="#FF9500" style={exploreStyles.itemIcon} />
              <TextInput
                testID="move-note.input.new-folder-name"
                ref={folderInputRef}
                style={[exploreStyles.folderInput, { color: colors.text, borderColor: colors.border }]}
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="Folder name"
                placeholderTextColor={colors.textSecondary}
                onSubmitEditing={handleCreateFolder}
                returnKeyType="done"
                autoFocus
              />
              <TouchableOpacity onPress={handleCreateFolder} style={exploreStyles.folderInputBtn}>
                <Ionicons name="checkmark" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={cancelCreatingFolder} style={exploreStyles.folderInputBtn}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          <View style={[exploreStyles.currentLocation, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
            <Ionicons name="folder-open-outline" size={18} color={colors.primary} />
            <Text style={[exploreStyles.currentLocationText, { color: colors.primary }]}>
              Move here: {currentPath || '(root)'}
            </Text>
          </View>

          {isLoading ? (
            <View style={exploreStyles.loading}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ListDropContainer
              targetPath={currentPath.split('/').slice(0, -1).join('/')}
              onDrop={handleMoveItemToFolder}
              highlightColor={colors.primary + '0D'}
            >
              <FlatList
                data={contents}
                keyExtractor={(item) => item.path}
                renderItem={renderItem}
                contentContainerStyle={contents.length === 0 ? exploreStyles.emptyList : undefined}
                ListEmptyComponent={
                  <View style={exploreStyles.emptyContainer}>
                    <Ionicons name="folder-open-outline" size={40} color={colors.textSecondary} />
                    <Text style={[exploreStyles.emptyText, { color: colors.textSecondary }]}>
                      This folder is empty
                    </Text>
                  </View>
                }
              />
            </ListDropContainer>
          )}
        </SafeAreaView>
      </DragDropBoundary>
    </Modal>
  );
}

const exploreStyles = StyleSheet.create({
  modalContent: {
    padding: 0,
    width: '100%',
    height: '90%',
  },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 4, minWidth: 50 },
  headerBtnText: { fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  destinationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  destinationLabel: { fontSize: 14, flex: 1 },
  breadcrumbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  breadcrumb: {
    flexDirection: 'row',
    flex: 1,
  },
  crumb: { fontSize: 14, fontWeight: '600' },
  crumbSep: { fontSize: 14 },
  newFolderBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  folderInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  folderInputBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  currentLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  currentLocationText: { fontSize: 13, fontWeight: '500' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemIcon: { marginRight: 12 },
  itemName: { fontSize: 15, flex: 1, fontWeight: '400' },
  itemMeta: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase' },
  dropZone: { minHeight: 44 },
  listDropContainer: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyList: { flexGrow: 1 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, marginTop: 8, textAlign: 'center' },
});

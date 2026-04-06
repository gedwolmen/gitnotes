import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useNotes } from '../contexts/NoteContext';
import { useFolders } from '../contexts/FolderContext';
import { useTheme } from '../contexts/ThemeContext';
import { useViewMode } from '../contexts/ViewModeContext';
import { RootStackParamList } from '../navigation/types';
import { Note } from '../models/Note';
import { Folder } from '../models/Folder';
import NoteCard from '../components/NoteCard';
import SearchBar from '../components/SearchBar';
import FolderBreadcrumb from '../components/FolderBreadcrumb';
import FolderTreeView from '../components/FolderTreeView';
import { HapticService } from '../utils/haptics';
import { filterNotesByFolder } from '../models/Note';
import { ViewMode, VIEW_MODE_LABELS, VIEW_MODE_ICONS } from '../utils/viewModes';
import { ShareService } from '../services/ShareService';
import { GitService, GitRepository } from '../services/GitService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function NotesListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { filteredNotes, isLoading, searchQuery, setSearchQuery, deleteNote, togglePin, error } = useNotes();
  const { folders } = useFolders();
  const { viewMode, setViewMode } = useViewMode();
  
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showFolderTree, setShowFolderTree] = useState(false);
  const [showViewModePicker, setShowViewModePicker] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);

  const loadRepositories = useCallback(async () => {
    setIsLoadingRepos(true);
    const repos = await GitService.getRepositories();
    setRepositories(repos);
    setIsLoadingRepos(false);
  }, []);

  const handleOpenRepoPicker = useCallback(async () => {
    await loadRepositories();
    setShowRepoPicker(true);
  }, [loadRepositories]);

  const handleSelectRepo = useCallback((repoPath: string | null) => {
    setSelectedRepo(repoPath);
    setShowRepoPicker(false);
  }, []);

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) || null,
    [folders, selectedFolderId]
  );

  const notesInFolder = useMemo(
    () => filterNotesByFolder(filteredNotes, selectedFolderId),
    [filteredNotes, selectedFolderId]
  );

  const handleNotePress = useCallback(
    (note: Note) => {
      navigation.navigate('NoteEditor', { noteId: note.id });
    },
    [navigation]
  );

  const handleNoteLongPress = useCallback(
    (note: Note) => {
      HapticService.medium();
      const pinAction = note.isPinned ? 'Unpin Note' : 'Pin Note';
      Alert.alert(
        'Note Actions',
        `What would you like to do with "${note.title || 'Untitled'}"?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => HapticService.light() },
          {
            text: 'Share',
            onPress: async () => {
              const success = await ShareService.shareAsMarkdown(note);
              if (success) {
                HapticService.success();
              } else {
                HapticService.error();
                Alert.alert('Error', 'Failed to share note');
              }
            },
          },
          {
            text: pinAction,
            onPress: async () => {
              const success = await togglePin(note.id);
              if (success) {
                HapticService.success();
              } else {
                HapticService.error();
                Alert.alert('Error', 'Failed to update pin status');
              }
            },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              const success = await deleteNote(note.id);
              if (!success) {
                HapticService.error();
                Alert.alert('Error', 'Failed to delete note');
              } else {
                HapticService.success();
              }
            },
          },
        ]
      );
    },
    [deleteNote, togglePin]
  );

  const handleSelectFolder = useCallback(
    (folder: Folder | null) => {
      HapticService.light();
      setSelectedFolderId(folder?.id || null);
      setShowFolderTree(false);
    },
    []
  );

  const toggleFolderTree = useCallback(() => {
    HapticService.light();
    setShowFolderTree(!showFolderTree);
  }, [showFolderTree]);

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      HapticService.selection();
      setViewMode(mode);
      setShowViewModePicker(false);
    },
    [setViewMode]
  );

  const toggleViewModePicker = useCallback(() => {
    HapticService.light();
    setShowViewModePicker(!showViewModePicker);
  }, [showViewModePicker]);

  const renderNote = useCallback(
    ({ item }: { item: Note }) => (
      <NoteCard note={item} onPress={handleNotePress} onLongPress={handleNoteLongPress} />
    ),
    [handleNotePress, handleNoteLongPress]
  );

  const renderGridNote = useCallback(
    ({ item }: { item: Note }) => (
      <View style={styles.gridItem}>
        <NoteCard note={item} onPress={handleNotePress} onLongPress={handleNoteLongPress} compact />
      </View>
    ),
    [handleNotePress, handleNoteLongPress]
  );

  const renderCardNote = useCallback(
    ({ item }: { item: Note }) => (
      <View style={styles.cardItem}>
        <NoteCard note={item} onPress={handleNotePress} onLongPress={handleNoteLongPress} />
      </View>
    ),
    [handleNotePress, handleNoteLongPress]
  );

  const renderJournalNote = useCallback(
    ({ item }: { item: Note }) => {
      const noteDate = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : 'Unknown date';
      return (
        <View style={styles.journalItem}>
          <Text style={[styles.journalDate, { color: colors.textSecondary }]}>{noteDate}</Text>
          <NoteCard note={item} onPress={handleNotePress} onLongPress={handleNoteLongPress} />
        </View>
      );
    },
    [handleNotePress, handleNoteLongPress, colors]
  );

  const keyExtractor = useCallback((item: Note) => item.id, []);

  const getListLayout = useCallback(() => {
    switch (viewMode) {
      case 'grid':
        return { numColumns: 2, columnWrapperStyle: styles.gridRow };
      case 'card':
        return { numColumns: 1, columnWrapperStyle: undefined };
      case 'journal':
        return { numColumns: 1, columnWrapperStyle: undefined };
      case 'list':
      default:
        return { numColumns: 1, columnWrapperStyle: undefined };
    }
  }, [viewMode]);

  const getRenderItem = useCallback(() => {
    switch (viewMode) {
      case 'grid':
        return renderGridNote;
      case 'card':
        return renderCardNote;
      case 'journal':
        return renderJournalNote;
      case 'list':
      default:
        return renderNote;
    }
  }, [viewMode, renderNote, renderGridNote, renderCardNote, renderJournalNote]);

  const getListContentStyle = useCallback(() => {
    switch (viewMode) {
      case 'grid':
        return styles.gridContent;
      case 'card':
        return styles.cardContent;
      case 'journal':
        return styles.journalContent;
      case 'list':
      default:
        return styles.listContent;
    }
  }, [viewMode]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search notes..."
        />
        <TouchableOpacity
          style={[styles.folderButton, { backgroundColor: colors.surface }]}
          onPress={toggleFolderTree}
        >
          <Ionicons
            name={showFolderTree ? 'folder-open' : 'folder'}
            size={20}
            color={showFolderTree ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.folderButton, { backgroundColor: colors.surface }]}
          onPress={toggleViewModePicker}
        >
          <Ionicons
            name={VIEW_MODE_ICONS[viewMode] as any}
            size={20}
            color={colors.primary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.folderButton, { backgroundColor: colors.surface }]}
          onPress={handleOpenRepoPicker}
        >
          <Ionicons
            name="code-slash"
            size={20}
            color={selectedRepo ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {showRepoPicker && (
        <Modal visible={showRepoPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Select Repository</Text>
                <TouchableOpacity onPress={() => setShowRepoPicker(false)}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {isLoadingRepos ? (
                <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
              ) : repositories.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: colors.text }]}>No repositories found</Text>
                  <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                    Add repositories in Settings
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={[{ path: null, name: 'All Repositories', id: '__all__' }, ...repositories]}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.repoItem, { borderBottomColor: colors.border }]}
                      onPress={() => handleSelectRepo(item.id === '__all__' ? null : item.path)}
                    >
                      <Ionicons 
                        name={item.id === '__all__' ? 'folder' : (selectedRepo === item.path ? 'checkmark-circle' : 'folder')} 
                        size={20} 
                        color={item.id === '__all__' ? colors.textSecondary : colors.primary} 
                      />
                      <Text style={[styles.repoItemText, { color: colors.text }]}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </View>
        </Modal>
      )}

      {showViewModePicker && (
        <View style={[styles.viewModePicker, { backgroundColor: colors.surface }]}>
          {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.viewModeOption,
                viewMode === mode && { backgroundColor: colors.primary + '20' },
              ]}
              onPress={() => handleViewModeChange(mode)}
            >
              <Ionicons
                name={VIEW_MODE_ICONS[mode] as any}
                size={20}
                color={viewMode === mode ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.viewModeLabel,
                  { color: viewMode === mode ? colors.primary : colors.text },
                ]}
              >
                {VIEW_MODE_LABELS[mode]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {error && (
        <View style={[styles.errorContainer, { backgroundColor: colors.error + '20', borderLeftColor: colors.error }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      {showFolderTree ? (
        <View style={[styles.folderTreeContainer, { backgroundColor: colors.surface }]}>
          <FolderTreeView
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
          />
        </View>
      ) : (
        <>
          {selectedFolder && (
            <FolderBreadcrumb
              folders={folders}
              currentFolder={selectedFolder}
              onNavigateToFolder={handleSelectFolder}
            />
          )}

          <FlatList
            data={notesInFolder}
            renderItem={getRenderItem()}
            keyExtractor={keyExtractor}
            key={`${viewMode}-${notesInFolder.length}`}
            {...getListLayout()}
            contentContainerStyle={getListContentStyle()}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name={selectedFolderId ? 'folder-open-outline' : 'document-text-outline'}
                  size={48}
                  color={colors.textSecondary}
                />
                <Text style={[styles.emptyText, { color: colors.text }]}>
                  {searchQuery ? 'No notes found' : selectedFolderId ? 'No notes in this folder' : 'No notes yet'}
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                  {searchQuery
                    ? 'Try a different search term'
                    : selectedFolderId
                    ? 'Create a note in this folder'
                    : 'Create your first note to get started'}
                </Text>
              </View>
            }
          />
        </>
      )}
    </SafeAreaView>
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
    gap: 8,
  },
  folderButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewModePicker: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    padding: 4,
  },
  viewModeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
  },
  viewModeLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderTreeContainer: {
    flex: 1,
    marginTop: 8,
    borderRadius: 12,
    marginHorizontal: 16,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  gridContent: {
    padding: 12,
    paddingTop: 8,
  },
  gridItem: {
    width: '48%',
    marginBottom: 12,
  },
  cardContent: {
    padding: 16,
    paddingTop: 8,
  },
  cardItem: {
    marginBottom: 12,
  },
  journalContent: {
    padding: 16,
    paddingTop: 8,
  },
  journalItem: {
    marginBottom: 8,
  },
  journalDate: {
    fontSize: 12,
    marginBottom: 4,
    marginLeft: 4,
  },
  errorContainer: {
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  errorText: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  loader: {
    padding: 40,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  repoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  repoItemText: {
    fontSize: 16,
    marginLeft: 12,
  },
});
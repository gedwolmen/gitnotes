import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useNotes } from '../contexts/NoteContext';
import { useFolders } from '../contexts/FolderContext';
import { useTheme } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Note } from '../models/Note';
import { Folder } from '../models/Folder';
import NoteCard from '../components/NoteCard';
import SearchBar from '../components/SearchBar';
import FolderBreadcrumb from '../components/FolderBreadcrumb';
import FolderTreeView from '../components/FolderTreeView';
import { HapticService } from '../utils/haptics';
import { filterNotesByFolder } from '../models/Note';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function NotesListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { filteredNotes, isLoading, searchQuery, setSearchQuery, deleteNote, error } = useNotes();
  const { folders } = useFolders();
  
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showFolderTree, setShowFolderTree] = useState(false);

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
      Alert.alert(
        'Delete Note',
        `Are you sure you want to delete "${note.title || 'Untitled'}"?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => HapticService.light() },
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
    [deleteNote]
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

  const renderNote = useCallback(
    ({ item }: { item: Note }) => (
      <NoteCard note={item} onPress={handleNotePress} onLongPress={handleNoteLongPress} />
    ),
    [handleNotePress, handleNoteLongPress]
  );

  const keyExtractor = useCallback((item: Note) => item.id, []);

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
      </View>

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
            renderItem={renderNote}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
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
});
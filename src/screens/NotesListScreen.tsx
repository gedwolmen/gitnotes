import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useNotes } from '../contexts/NoteContext';
import { useTheme } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Note } from '../models/Note';
import NoteCard from '../components/NoteCard';
import SearchBar from '../components/SearchBar';
import { HapticService } from '../utils/haptics';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function NotesListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { filteredNotes, isLoading, searchQuery, setSearchQuery, deleteNote, error } = useNotes();

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

  const renderNote = useCallback(
    ({ item }: { item: Note }) => (
      <NoteCard note={item} onPress={handleNotePress} onLongPress={handleNoteLongPress} />
    ),
    [handleNotePress, handleNoteLongPress]
  );

  const keyExtractor = useCallback((item: Note) => item.id, []);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search notes..."
      />
      {error && (
        <View style={[styles.errorContainer, { backgroundColor: colors.error + '20', borderLeftColor: colors.error }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      )}
      <FlatList
        data={filteredNotes}
        renderItem={renderNote}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.text }]}>
              {searchQuery ? 'No notes found' : 'No notes yet'}
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              {searchQuery
                ? 'Try a different search term'
                : 'Create your first note to get started'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
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
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});

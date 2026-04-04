import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { useNotes } from '../contexts/NoteContext';
import TemplateSelector from '../components/TemplateSelector';
import { NoteTemplate } from '../services/TemplateService';
import { HapticService } from '../utils/haptics';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { notes } = useNotes();
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  const handleCreateNote = useCallback(() => {
    HapticService.medium();
    setShowTemplateSelector(true);
  }, []);

  const handleTemplateSelect = useCallback(
    (_template: NoteTemplate) => {
      setShowTemplateSelector(false);
      navigation.navigate('NoteEditor', {});
    },
    [navigation]
  );

  const recentNotes = notes.slice(0, 3);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>GitNotes</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Your development notes, organized.
      </Text>

      <View style={[styles.statsContainer, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Ionicons name="document-text" size={20} color={colors.primary} />
          <Text style={[styles.statsText, { color: colors.text }]}>
            {notes.length} note{notes.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={handleCreateNote}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={styles.buttonText}>Create New Note</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryButton, { borderColor: colors.primary }]}
        onPress={() => navigation.navigate('NoteEditor', {})}
      >
        <Ionicons name="document-outline" size={20} color={colors.primary} />
        <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
          Blank Note
        </Text>
      </TouchableOpacity>

      {recentNotes.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Recent Notes
          </Text>
          {recentNotes.map((note) => (
            <TouchableOpacity
              key={note.id}
              style={[styles.recentNote, { backgroundColor: colors.surface }]}
              onPress={() => navigation.navigate('NoteEditor', { noteId: note.id })}
            >
              <View style={styles.recentNoteContent}>
                <Text style={[styles.recentNoteTitle, { color: colors.text }]} numberOfLines={1}>
                  {note.title || 'Untitled'}
                </Text>
                <Text style={[styles.recentNotePreview, { color: colors.textSecondary }]} numberOfLines={1}>
                  {note.content.substring(0, 50)}...
                </Text>
              </View>
              {note.repo && (
                <View style={styles.gitIndicator}>
                  <Ionicons name="code-slash" size={14} color="#666" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TemplateSelector
        visible={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        onSelect={handleTemplateSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  statsContainer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 24,
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsText: {
    fontSize: 14,
    marginLeft: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 24,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  recentSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  recentNote: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  recentNoteContent: {
    flex: 1,
  },
  recentNoteTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  recentNotePreview: {
    fontSize: 13,
  },
  gitIndicator: {
    marginLeft: 8,
  },
});

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Note } from '../models/Note';
import { useTheme } from '../contexts/ThemeContext';

interface NoteCardProps {
  note: Note;
  onPress: (note: Note) => void;
  onLongPress?: (note: Note) => void;
}

export default function NoteCard({ note, onPress, onLongPress }: NoteCardProps) {
  const { colors } = useTheme();

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card }]}
      onPress={() => onPress(note)}
      onLongPress={() => onLongPress?.(note)}
      activeOpacity={0.7}
    >
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {note.title || 'Untitled'}
      </Text>
      <Text style={[styles.content, { color: colors.textSecondary }]} numberOfLines={2}>
        {note.content || 'No content'}
      </Text>
      <View style={styles.footer}>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {formatDate(note.updatedAt)}
        </Text>
        {note.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {note.tags.slice(0, 2).map((tag) => (
              <View key={tag} style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
              </View>
            ))}
            {note.tags.length > 2 && (
              <Text style={[styles.moreTagsText, { color: colors.textSecondary }]}>
                +{note.tags.length - 2}
              </Text>
            )}
          </View>
        )}
      </View>
      {note.repo && (
        <View style={[styles.repoContainer, { borderTopColor: colors.border }]}>
          <Text style={[styles.repoText, { color: colors.textSecondary }]}>📁 {note.repo}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  content: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tag: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 4,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  moreTagsText: {
    fontSize: 11,
    marginLeft: 4,
  },
  repoContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  repoText: {
    fontSize: 12,
  },
});

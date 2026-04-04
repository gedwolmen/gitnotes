import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { format } from 'date-fns';
import { Note } from '../models/Note';
import { useTheme } from '../contexts/ThemeContext';

interface NoteCardProps {
  note: Note;
  onPress: (note: Note) => void;
  onLongPress?: (note: Note) => void;
}

export default function NoteCard({ note, onPress, onLongPress }: NoteCardProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.card, 
        { backgroundColor: colors.card, shadowColor: colors.text }
      ]}
      onPress={() => onPress(note)}
      onLongPress={() => onLongPress?.(note)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {note.title || 'Untitled Note'}
        </Text>
        <Text style={[styles.content, { color: colors.textSecondary }]} numberOfLines={2}>
          {note.content || 'No content'}
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {format(new Date(note.updatedAt), 'MMM d, yyyy')}
        </Text>
        
        {note.tags && note.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {note.tags.slice(0, 3).map((tag) => (
              <View key={tag} style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
              </View>
            ))}
            {note.tags.length > 3 && (
              <Text style={[styles.moreTagsText, { color: colors.textSecondary }]}>
                +{note.tags.length - 3}
              </Text>
            )}
          </View>
        )}
      </View>

      {note.repo && (
        <View style={[styles.repoContainer, { borderTopColor: colors.border }]}>
          <Text style={[styles.repoText, { color: colors.textSecondary }]}>📁 {note.repo}</Text>
          {note.branch && (
            <Text style={[styles.branchText, { color: colors.primary }]}>🌿 {note.branch}</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  content: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  date: {
    fontSize: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tag: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  moreTagsText: {
    fontSize: 10,
    marginLeft: 4,
  },
  repoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  repoText: {
    fontSize: 12,
    marginRight: 12,
  },
  branchText: {
    fontSize: 12,
  },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Note } from '../../models/Note';
import { useTheme } from '../../contexts/ThemeContext';

interface JournalEntryCardProps {
  note: Note;
  onPress: (note: Note) => void;
}

function getPreviewText(content: string): string {
  const text = content
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function getWordCount(content: string): number {
  const text = getPreviewText(content);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function JournalEntryCard({ note, onPress }: JournalEntryCardProps) {
  const { colors } = useTheme();
  const preview = getPreviewText(note.content);
  const wordCount = getWordCount(note.content);
  const isEmpty = !preview;

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.surface }]}
      onPress={() => onPress(note)}
      activeOpacity={0.7}
    >
      <Text
        style={[styles.title, { color: isEmpty ? colors.textSecondary : colors.text }]}
        numberOfLines={1}
      >
        {isEmpty ? 'Empty entry' : note.title}
      </Text>
      {!isEmpty && (
        <Text
          style={[styles.preview, { color: colors.textSecondary }]}
          numberOfLines={3}
        >
          {preview}
        </Text>
      )}
      {wordCount > 0 && (
        <Text style={[styles.wordCount, { color: colors.textSecondary }]}>
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  preview: {
    fontSize: 14,
    lineHeight: 20,
  },
  wordCount: {
    fontSize: 11,
    marginTop: 6,
  },
});

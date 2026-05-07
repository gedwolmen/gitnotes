import React from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface MarkdownEditorProps {
  content: string;
  onContentChange: (text: string) => void;
  placeholder?: string;
}

export default function MarkdownEditor({ content, onContentChange, placeholder = 'Start writing...' }: MarkdownEditorProps) {
  const { colors } = useTheme();

  return (
    <TextInput
      style={[styles.editor, { color: colors.text }]}
      value={content}
      onChangeText={onContentChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      multiline
      textAlignVertical="top"
      autoCorrect
      spellCheck
    />
  );
}

const styles = StyleSheet.create({
  editor: {
    fontSize: 16,
    padding: 16,
    lineHeight: 24,
    minHeight: 300,
  },
});

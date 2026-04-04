import React, { useState, useCallback } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Text, ScrollView } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../contexts/ThemeContext';

interface MarkdownEditorProps {
  content: string;
  onContentChange: (text: string) => void;
  placeholder?: string;
}

export default function MarkdownEditor({ content, onContentChange, placeholder = 'Start writing...' }: MarkdownEditorProps) {
  const [isPreview, setIsPreview] = useState(false);
  const { colors, isDark } = useTheme();

  const togglePreview = useCallback(() => {
    setIsPreview((prev) => !prev);
  }, []);

  const markdownStyles = {
    body: {
      fontSize: 16,
      lineHeight: 24,
      color: colors.text,
    },
    heading1: {
      fontSize: 28,
      fontWeight: 'bold' as const,
      marginBottom: 12,
      color: colors.text,
    },
    heading2: {
      fontSize: 24,
      fontWeight: 'bold' as const,
      marginBottom: 10,
      color: colors.text,
    },
    heading3: {
      fontSize: 20,
      fontWeight: '600' as const,
      marginBottom: 8,
      color: colors.text,
    },
    paragraph: {
      marginBottom: 12,
    },
    code_inline: {
      backgroundColor: isDark ? '#2c2c2e' : '#f0f0f0',
      paddingHorizontal: 4,
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 14,
      color: colors.text,
    },
    code_block: {
      backgroundColor: isDark ? '#2c2c2e' : '#f5f5f5',
      padding: 12,
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 14,
      marginVertical: 8,
      color: colors.text,
    },
    fence: {
      backgroundColor: isDark ? '#2c2c2e' : '#f5f5f5',
      padding: 12,
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 14,
      marginVertical: 8,
      color: colors.text,
    },
    blockquote: {
      backgroundColor: isDark ? '#1c2833' : '#f0f8ff',
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
      paddingLeft: 12,
      paddingVertical: 8,
      marginVertical: 8,
      color: colors.text,
    },
    link: {
      color: colors.primary,
    },
    list_item: {
      marginBottom: 4,
      color: colors.text,
    },
    bullet_list: {
      marginBottom: 12,
    },
    ordered_list: {
      marginBottom: 12,
    },
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: 16,
    },
  };

  return (
    <View style={styles.container}>
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={togglePreview} style={[styles.previewToggle, { backgroundColor: isDark ? '#2c2c2e' : '#f0f0f0' }]}>
          <Text style={[styles.previewToggleText, { color: colors.primary }]}>{isPreview ? 'Edit' : 'Preview'}</Text>
        </TouchableOpacity>
      </View>

      {isPreview ? (
        <ScrollView style={styles.previewContainer}>
          {content.trim() ? (
            <Markdown style={markdownStyles}>{content}</Markdown>
          ) : (
            <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}>Nothing to preview</Text>
          )}
        </ScrollView>
      ) : (
        <TextInput
          style={[styles.editor, { color: colors.text }]}
          value={content}
          onChangeText={onContentChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          multiline
          textAlignVertical="top"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  previewToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  previewToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  editor: {
    flex: 1,
    fontSize: 16,
    padding: 16,
    lineHeight: 24,
  },
  previewContainer: {
    flex: 1,
    padding: 16,
  },
  emptyPreview: {
    fontSize: 16,
    fontStyle: 'italic',
  },
});

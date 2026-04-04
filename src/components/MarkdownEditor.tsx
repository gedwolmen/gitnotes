import React, { useState, useCallback } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Text, ScrollView } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface MarkdownEditorProps {
  content: string;
  onContentChange: (text: string) => void;
  placeholder?: string;
}

export default function MarkdownEditor({ content, onContentChange, placeholder = 'Start writing...' }: MarkdownEditorProps) {
  const [isPreview, setIsPreview] = useState(false);

  const togglePreview = useCallback(() => {
    setIsPreview((prev) => !prev);
  }, []);

  const markdownStyles = {
    body: {
      fontSize: 16,
      lineHeight: 24,
      color: '#333',
    },
    heading1: {
      fontSize: 28,
      fontWeight: 'bold' as const,
      marginBottom: 12,
      color: '#1a1a1a',
    },
    heading2: {
      fontSize: 24,
      fontWeight: 'bold' as const,
      marginBottom: 10,
      color: '#1a1a1a',
    },
    heading3: {
      fontSize: 20,
      fontWeight: '600' as const,
      marginBottom: 8,
      color: '#1a1a1a',
    },
    paragraph: {
      marginBottom: 12,
    },
    code_inline: {
      backgroundColor: '#f0f0f0',
      paddingHorizontal: 4,
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 14,
    },
    code_block: {
      backgroundColor: '#f5f5f5',
      padding: 12,
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 14,
      marginVertical: 8,
    },
    fence: {
      backgroundColor: '#f5f5f5',
      padding: 12,
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 14,
      marginVertical: 8,
    },
    blockquote: {
      backgroundColor: '#f0f8ff',
      borderLeftWidth: 4,
      borderLeftColor: '#007AFF',
      paddingLeft: 12,
      paddingVertical: 8,
      marginVertical: 8,
    },
    link: {
      color: '#007AFF',
    },
    list_item: {
      marginBottom: 4,
    },
    bullet_list: {
      marginBottom: 12,
    },
    ordered_list: {
      marginBottom: 12,
    },
    hr: {
      backgroundColor: '#e0e0e0',
      height: 1,
      marginVertical: 16,
    },
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={togglePreview} style={styles.previewToggle}>
          <Text style={styles.previewToggleText}>{isPreview ? 'Edit' : 'Preview'}</Text>
        </TouchableOpacity>
      </View>

      {isPreview ? (
        <ScrollView style={styles.previewContainer}>
          {content.trim() ? (
            <Markdown style={markdownStyles}>{content}</Markdown>
          ) : (
            <Text style={styles.emptyPreview}>Nothing to preview</Text>
          )}
        </ScrollView>
      ) : (
        <TextInput
          style={styles.editor}
          value={content}
          onChangeText={onContentChange}
          placeholder={placeholder}
          placeholderTextColor="#999"
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
    borderBottomColor: '#f0f0f0',
  },
  previewToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  previewToggleText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  editor: {
    flex: 1,
    fontSize: 16,
    padding: 16,
    lineHeight: 24,
    color: '#333',
  },
  previewContainer: {
    flex: 1,
    padding: 16,
  },
  emptyPreview: {
    fontSize: 16,
    color: '#999',
    fontStyle: 'italic',
  },
});

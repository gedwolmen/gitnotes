import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  suggestions?: string[];
  maxTags?: number;
}

export default function TagInput({
  tags,
  onTagsChange,
  suggestions = [],
  maxTags = 10,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { colors } = useTheme();

  const handleAddTag = useCallback(
    (tag: string) => {
      const trimmedTag = tag.trim().toLowerCase();
      if (trimmedTag && !tags.includes(trimmedTag) && tags.length < maxTags) {
        onTagsChange([...tags, trimmedTag]);
      }
      setInputValue('');
      setShowSuggestions(false);
    },
    [tags, onTagsChange, maxTags]
  );

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      onTagsChange(tags.filter((tag) => tag !== tagToRemove));
    },
    [tags, onTagsChange]
  );

  const handleInputChange = useCallback((text: string) => {
    setInputValue(text);
    setShowSuggestions(text.length > 0);
  }, []);

  const handleSubmitEditing = useCallback(() => {
    if (inputValue.trim()) {
      handleAddTag(inputValue);
    }
  }, [inputValue, handleAddTag]);

  const filteredSuggestions = suggestions.filter(
    (suggestion) =>
      suggestion.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(suggestion)
  );

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      <View style={styles.tagsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsScrollView}>
          {tags.map((tag) => (
            <View key={tag} style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
              <TouchableOpacity onPress={() => handleRemoveTag(tag)} style={styles.removeButton}>
                <Ionicons name="close-circle" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={inputValue}
          onChangeText={handleInputChange}
          onSubmitEditing={handleSubmitEditing}
          placeholder={tags.length === 0 ? 'Add tags...' : 'Add more tags...'}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
      </View>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <View style={[styles.suggestionsContainer, { backgroundColor: colors.surface }]}>
          {filteredSuggestions.slice(0, 5).map((suggestion) => (
            <TouchableOpacity
              key={suggestion}
              style={styles.suggestionItem}
              onPress={() => handleAddTag(suggestion)}
            >
              <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
              <Text style={[styles.suggestionText, { color: colors.text }]}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {tags.length >= maxTags && (
        <Text style={[styles.limitText, { color: colors.error }]}>Maximum {maxTags} tags reached</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tagsContainer: {
    marginBottom: 8,
  },
  tagsScrollView: {
    flexGrow: 0,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 4,
    paddingLeft: 12,
    paddingRight: 4,
    marginRight: 8,
  },
  tagText: {
    fontSize: 14,
    marginRight: 4,
  },
  removeButton: {
    padding: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  suggestionsContainer: {
    marginTop: 8,
    borderRadius: 8,
    padding: 8,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  suggestionText: {
    fontSize: 14,
    marginLeft: 8,
  },
  limitText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});

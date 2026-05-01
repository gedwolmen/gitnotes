import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { Chip, Input } from './ui';

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
            <Chip
              key={tag}
              label={tag}
              active
              onLongPress={() => handleRemoveTag(tag)}
              trailing={<Ionicons name="close-circle" size={16} color={colors.primary} />}
              style={styles.tagChip}
            />
          ))}
        </ScrollView>
      </View>

      <Input
        value={inputValue}
        onChangeText={handleInputChange}
        onSubmitEditing={handleSubmitEditing}
        placeholder={tags.length === 0 ? 'Add tags...' : 'Add more tags...'}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        containerStyle={{ backgroundColor: colors.surface }}
      />

      {showSuggestions && filteredSuggestions.length > 0 && (
        <View style={[styles.suggestionsContainer, { backgroundColor: colors.surface }]}>
          {filteredSuggestions.slice(0, 5).map((suggestion) => (
            <Chip
              key={suggestion}
              label={suggestion}
              onPress={() => handleAddTag(suggestion)}
              leading={<Ionicons name="add-circle-outline" size={16} color={colors.primary} />}
              style={styles.suggestionChip}
            />
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
  tagChip: {
    marginRight: 8,
  },
  suggestionsContainer: {
    marginTop: 8,
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {},
  limitText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});

import React from 'react';
import { TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { Input } from './ui';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export default function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search notes...',
  onClear,
  style,
  testID,
}: SearchBarProps) {
  const { colors } = useTheme();

  const handleClear = () => {
    onChangeText('');
    onClear?.();
  };

  return (
    <Input
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      returnKeyType="search"
      autoCorrect={false}
      autoCapitalize="none"
      containerStyle={style}
      surfaceTestID={testID}
      testID="search-bar.input.search"
      leading={<Ionicons name="search" size={20} color={colors.textSecondary} />}
      trailing={
        value.length > 0 ? (
          <TouchableOpacity testID="search-bar.icon-button.clear" onPress={handleClear} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : undefined
      }
    />
  );
}

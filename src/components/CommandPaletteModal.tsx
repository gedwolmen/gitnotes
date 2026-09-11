import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Modal } from './ui/Modal';
import { searchCommands, Command } from '../services/CommandRegistry';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface CommandPaletteModalProps {
  visible: boolean;
  onClose: () => void;
}

function CommandRow({ command, onPress }: { command: Command; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <View style={{ marginRight: 12 }}>
        <Ionicons name={(command.icon as any) || 'command-outline'} size={20} color={colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '500' }}>{command.label}</Text>
        {command.description && (
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{command.description}</Text>
        )}
      </View>
      <View style={[styles.categoryBadge, { backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{command.category}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function CommandPaletteModal({ visible, onClose }: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(() => searchCommands(''));
  const { colors } = useTheme();

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    setResults(searchCommands(text));
  }, []);

  const handleCommandPress = useCallback((command: Command) => {
    command.action();
    onClose();
  }, [onClose]);

  const hintCommands = ['new note', 'go home', 'toggle theme', 'sync'];

  const handleHintPress = useCallback((hint: string) => {
    setQuery(hint);
    setResults(searchCommands(hint));
  }, []);

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      bottomSheet
      dismissOnBackdrop
      contentStyle={{ padding: 16, paddingBottom: 34, maxHeight: '70%' }}
    >
      <Text style={[styles.title, { color: colors.text }]}>Command Palette</Text>
      <TextInput
        value={query}
        onChangeText={handleQueryChange}
        placeholder="Search commands..."
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
        ]}
        autoFocus
      />
      <View style={styles.hintsContainer}>
        {hintCommands.map((hint, index) => (
          <TouchableOpacity
            key={hint}
            onPress={() => handleHintPress(hint)}
            style={[
              styles.hintChip,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>{hint}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }}>
            No commands found
          </Text>
        }
        renderItem={({ item }) => (
          <CommandRow command={item} onPress={() => handleCommandPress(item)} />
        )}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 8 },
  hintsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  hintChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  hintText: { fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
});

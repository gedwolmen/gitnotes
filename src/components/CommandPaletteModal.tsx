import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
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

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      bottomSheet
      dismissOnBackdrop
    >
      <View style={styles.container}>
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
        <View style={styles.list}>
          {results.map(cmd => (
            <CommandRow key={cmd.id} command={cmd} onPress={() => handleCommandPress(cmd)} />
          ))}
          {results.length === 0 && (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>
              No commands found
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 12 },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
});

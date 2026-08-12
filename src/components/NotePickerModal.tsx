import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useNotes } from '../contexts/NoteContext';
import { Modal } from './ui';

interface NotePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (noteId: string, noteTitle: string) => void;
}

export function NotePickerModal({
  visible,
  onClose,
  onSelect,
}: NotePickerModalProps) {
  const { colors } = useTheme();
  const { notes } = useNotes();
  const [search, setSearch] = useState('');

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        (n.tags?.some((t) => t.toLowerCase().includes(q)) ?? false),
    );
  }, [notes, search]);

  const handleSelect = useCallback(
    (noteId: string, noteTitle: string) => {
      setSearch('');
      onSelect(noteId, noteTitle);
    },
    [onSelect],
  );

  const handleClose = useCallback(() => {
    setSearch('');
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      onRequestClose={handleClose}
      bottomSheet
      contentStyle={{ padding: 16, paddingBottom: 34, maxHeight: '70%' }}
    >
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          Pick a Note
        </Text>
        <TouchableOpacity onPress={handleClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <TextInput
        style={[
          styles.searchInput,
          {
            borderColor: colors.border,
            color: colors.text,
            backgroundColor: colors.surface,
          },
        ]}
        value={search}
        onChangeText={setSearch}
        placeholder="Search notes\u2026"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      <FlatList
        data={filteredNotes}
        keyExtractor={(item) => item.id}
        style={{ marginTop: 8 }}
        ListEmptyComponent={
          <Text
            style={{
              textAlign: 'center',
              color: colors.textSecondary,
              paddingVertical: 24,
            }}
          >
            No notes yet
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.row,
              { borderBottomColor: colors.border },
            ]}
            onPress={() => handleSelect(item.id, item.title)}
          >
            <Ionicons
              name="document-outline"
              size={18}
              color={colors.primary}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                style={{ color: colors.text, fontSize: 15 }}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              {item.tags && item.tags.length > 0 && (
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {item.tags.map((t) => `#${t}`).join(' ')}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 44,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

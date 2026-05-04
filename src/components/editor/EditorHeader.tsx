import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../ui';

interface EditorHeaderProps {
  noteId?: string;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function EditorHeader({ noteId, isSaving, onCancel, onSave }: EditorHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.headerLeft}>
        <Button variant="ghost" label="Cancel" onPress={onCancel} disabled={isSaving} textStyle={styles.headerButtonText} />
      </View>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{noteId ? 'Edit Note' : 'New Note'}</Text>
      <View style={styles.headerRight}>
        <Button
          variant="ghost"
          label={isSaving ? 'Saving…' : 'Save'}
          onPress={onSave}
          disabled={isSaving}
          textStyle={[styles.headerButtonText, styles.saveButtonText, isSaving && styles.disabledButton]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
  },
  headerButtonText: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  saveButtonText: {
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
});

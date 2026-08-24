import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

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
  const saveTrailingIcon = isSaving ? (
    <ActivityIndicator
      testID="note-editor.button.save-spinner"
      size="small"
      color={colors.textSecondary}
    />
  ) : null;

  return (
    <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
      <View testID="editor-header.button.cancel" style={styles.headerLeft}>
        <Button variant="ghost" label="Cancel" testID="note-editor.button.cancel" accessibilityLabel="Cancel" onPress={onCancel} disabled={isSaving} textStyle={styles.headerButtonText} />
      </View>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{noteId ? 'Edit Note' : 'New Note'}</Text>
      <View testID="editor-header.button.save" style={styles.headerRight}>
        <Button
          variant="ghost"
          label="Save"
          testID="note-editor.button.save"
          accessibilityLabel="Save"
          onPress={onSave}
          disabled={isSaving}
          trailingIcon={saveTrailingIcon}
          style={isSaving ? styles.saveButtonBusy : undefined}
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
  saveButtonBusy: {
    backgroundColor: 'rgba(120, 120, 120, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 4,
  },
});

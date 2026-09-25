import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme, useTokens } from '../../contexts/ThemeContext';
import { Button } from '../ui';

interface EditorHeaderProps {
  noteId?: string;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function EditorHeader({ noteId, isSaving, onCancel, onSave }: EditorHeaderProps) {
  const { colors } = useTheme();
  const { spacing, type } = useTokens();
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
        <Button
          variant="ghost"
          label="Cancel"
          testID="note-editor.button.cancel"
          accessibilityLabel="Cancel editing and discard changes"
          onPress={onCancel}
          disabled={isSaving}
          textStyle={{ fontSize: type.md }}
        />
      </View>
      <Text
        accessibilityRole="header"
        style={[styles.headerTitle, { color: colors.text, fontSize: type.lg }]}
      >
        {noteId ? 'Edit Note' : 'New Note'}
      </Text>
      <View testID="editor-header.button.save" style={styles.headerRight}>
        <Button
          variant="ghost"
          label="Save"
          testID="note-editor.button.save"
          accessibilityLabel="Save note"
          onPress={onSave}
          disabled={isSaving}
          trailingIcon={saveTrailingIcon}
          style={isSaving ? [styles.saveButtonBusy, { backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing[1] }] : undefined}
          textStyle={[
            { fontSize: type.md, fontWeight: '600' },
            isSaving && styles.disabledButton,
          ]}
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
    minWidth: 0,
    flexShrink: 1,
  },
  headerTitle: {
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 0,
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  disabledButton: {
    opacity: 0.5,
  },
  saveButtonBusy: {
    borderRadius: 6,
  },
});

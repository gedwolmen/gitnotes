import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { IconButton } from '../ui';

interface EditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onVoiceInput: () => void;
  onInsertCanvas: () => void;
  onInsertImage: () => void;
  onLinkCanvas: () => void;
}

export function EditorToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onVoiceInput,
  onInsertCanvas,
  onInsertImage,
  onLinkCanvas,
}: EditorToolbarProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.toolbar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
      {(canUndo || canRedo) && (
        <>
          <IconButton size="sm" testID="note-editor.toolbar.undo" onPress={onUndo} disabled={!canUndo} accessibilityLabel="Undo">
            <Ionicons name="arrow-undo" size={20} color={canUndo ? colors.primary : colors.textSecondary} />
          </IconButton>
          <IconButton size="sm" testID="note-editor.toolbar.redo" onPress={onRedo} disabled={!canRedo} accessibilityLabel="Redo">
            <Ionicons name="arrow-redo" size={20} color={canRedo ? colors.primary : colors.textSecondary} />
          </IconButton>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </>
      )}

      <IconButton size="sm" testID="note-editor.toolbar.voice-input" onPress={onVoiceInput} accessibilityLabel="Voice input">
        <Ionicons name="mic-outline" size={20} color={colors.primary} />
      </IconButton>
      <IconButton size="sm" testID="note-editor.toolbar.canvas-modal" onPress={onInsertCanvas} accessibilityLabel="Insert canvas">
        <Ionicons name="brush-outline" size={20} color={colors.primary} />
      </IconButton>
      <IconButton size="sm" testID="note-editor.toolbar.insert-image" onPress={onInsertImage} accessibilityLabel="Insert image">
        <Ionicons name="image-outline" size={20} color={colors.primary} />
      </IconButton>
      <IconButton size="sm" testID="note-editor.toolbar.canvas-picker" onPress={onLinkCanvas} accessibilityLabel="Link existing canvas">
        <Ionicons name="easel-outline" size={20} color={colors.primary} />
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  divider: {
    width: 1,
    height: 20,
    marginHorizontal: 4,
  },
});

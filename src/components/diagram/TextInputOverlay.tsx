/**
 * Keyboard-safe text input overlay for diagram editor.
 *
 * Displays a modal with text input and border style selection,
 * then creates a text object at the specified grid position.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';

import type { InkColor } from '../../models/Diagram';
import { useTheme } from '../../contexts/ThemeContext';
import { BORDER_MODES } from './types';

interface TextInputOverlayProps {
  visible: boolean;
  initialText: string;
  border: 'none' | 'single' | 'double' | 'underline';
  color: InkColor;
  onSubmit: (text: string, border: 'none' | 'single' | 'double' | 'underline', color: InkColor) => void;
  onCancel: () => void;
}

export function TextInputOverlay({
  visible,
  initialText,
  border,
  color,
  onSubmit,
  onCancel,
}: TextInputOverlayProps) {
  const { colors } = useTheme();
  const [text, setText] = useState(initialText);
  const [currentBorder, setCurrentBorder] = useState(border);

  useEffect(() => {
    setText(initialText);
    setCurrentBorder(border);
  }, [initialText, border]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onCancel}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          <View
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            pointerEvents="box-none"
          >
            <Text style={[styles.title, { color: colors.text }]}>Add Text</Text>

            <TextInput
              testID="diagram-text-input"
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={text}
              onChangeText={setText}
              placeholder="Enter text..."
              placeholderTextColor={colors.textSecondary}
              autoFocus
              multiline
              maxLength={100}
            />

            {/* Border style options */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Border</Text>
            <View style={styles.borderRow}>
              {BORDER_MODES.map((b) => (
                <TouchableOpacity
                  key={b}
                  testID={`diagram-border.${b}`}
                  accessibilityLabel={b}
                  style={[
                    styles.borderOption,
                    { borderColor: colors.border },
                    currentBorder === b && { backgroundColor: colors.primary + '20', borderColor: colors.primary },
                  ]}
                  onPress={() => setCurrentBorder(b)}
                >
                  <Text style={[styles.borderOptionText, { color: colors.text }]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, { borderColor: colors.border }]}
                onPress={onCancel}
              >
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (text.trim()) {
                    onSubmit(text.trim(), currentBorder, color);
                  }
                  setText('');
                }}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 400,
  },
  sheet: {
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    marginBottom: 4,
  },
  borderRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
  },
  borderOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  borderOptionText: {
    fontSize: 11,
    textTransform: 'capitalize',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
});

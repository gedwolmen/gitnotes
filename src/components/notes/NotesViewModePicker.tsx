import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { ViewMode, VIEW_MODE_ICONS, VIEW_MODE_LABELS } from '../../utils/viewModes';

interface NotesViewModePickerProps {
  visible: boolean;
  viewMode: ViewMode;
  onClose: () => void;
  onChange: (mode: ViewMode) => void;
  isPro: boolean;
  onLockedPress: () => void;
}

export function NotesViewModePicker({
  visible,
  viewMode,
  onClose,
  onChange,
  isPro,
  onLockedPress,
}: NotesViewModePickerProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity testID="notes-view-mode.button.close" style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.handle, { backgroundColor: colors.border + '40' }]} />
          <Text style={[styles.title, { color: colors.textSecondary }]}>View Mode</Text>
          <View style={styles.options}>
            {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => {
              const isSelected = viewMode === mode;
              const isLocked = mode === 'graph' && !isPro;
              return (
                <TouchableOpacity
                  key={mode}
                  testID={`notes-view-mode.button.change-${mode}`}
                  style={[styles.option, isSelected && { backgroundColor: colors.primary + '15' }]}
                  onPress={() => (isLocked ? onLockedPress() : onChange(mode))}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={VIEW_MODE_ICONS[mode]}
                    size={22}
                    color={isSelected ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[styles.label, { color: isSelected ? colors.primary : colors.text }]}
                  >
                    {VIEW_MODE_LABELS[mode]}
                  </Text>
                  {isLocked ? (
                    <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
                  ) : isSelected ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  options: {
    paddingHorizontal: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    gap: 12,
  },
  label: {
    fontSize: 16,
    flex: 1,
  },
});

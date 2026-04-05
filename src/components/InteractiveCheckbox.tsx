import React, { useCallback } from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { HapticService } from '../utils/haptics';

interface InteractiveCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  size?: number;
  disabled?: boolean;
}

export default function InteractiveCheckbox({
  checked,
  onToggle,
  size = 22,
  disabled = false,
}: InteractiveCheckboxProps) {
  const { colors, isDark } = useTheme();

  const handlePress = useCallback(() => {
    if (!disabled) {
      HapticService.light();
      onToggle();
    }
  }, [disabled, onToggle]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.container, { width: size + 4, height: size + 4 }]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View
        style={[
          styles.checkbox,
          {
            width: size,
            height: size,
            borderRadius: size / 4,
            backgroundColor: checked ? colors.primary : 'transparent',
            borderColor: checked ? colors.primary : colors.textSecondary,
          },
        ]}
      >
        {checked && (
          <Ionicons
            name="checkmark"
            size={size - 4}
            color={isDark ? '#000' : '#fff'}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
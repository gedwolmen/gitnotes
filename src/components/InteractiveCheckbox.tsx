import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { HapticService } from '../utils/haptics';
import { Surface } from './ui';

interface InteractiveCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  size?: number;
  disabled?: boolean;
  testID?: string;
}

export default function InteractiveCheckbox({
  checked,
  onToggle,
  size = 22,
  disabled = false,
  testID,
}: InteractiveCheckboxProps) {
  const { colors } = useTheme();

  const handlePress = useCallback(() => {
    if (!disabled) {
      HapticService.light();
      onToggle();
    }
  }, [disabled, onToggle]);

  return (
    <View testID="interactive-checkbox.checkbox.change">
      <Pressable
        testID={testID ?? "interactive-checkbox.checkbox.fallback"}
      onPress={handlePress}
      disabled={disabled}
      style={[styles.container, { width: size + 6, height: size + 6, opacity: disabled ? 0.5 : 1 }]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Surface
        elevation="subtle"
        radius="sm"
        inset={checked}
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && (
          <Ionicons
            name="checkmark"
            size={size - 6}
            color={colors.accent}
          />
        )}
      </Surface>
    </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

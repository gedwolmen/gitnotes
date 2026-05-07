import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ColorPicker, {
  Panel1,
  HueSlider,
  Preview,
  InputWidget,
} from 'reanimated-color-picker';

import { Modal } from './ui';
import { useTheme } from '../contexts/ThemeContext';

export interface HexColorPickerModalProps {
  visible: boolean;
  initialColor?: string | null;
  presets?: readonly string[];
  presetTestIdPrefix?: string;
  presetIds?: readonly string[];
  allowClear?: boolean;
  clearTestID?: string;
  cancelTestID?: string;
  confirmTestID?: string;
  title?: string;
  onClose: () => void;
  /** Called with the chosen hex (e.g. '#aabbcc') or null if cleared. */
  onSelect: (hex: string | null) => void;
}

const DEFAULT_INITIAL = '#3b82f6';

function normalizeHex(value?: string | null): string {
  if (!value) return DEFAULT_INITIAL;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_INITIAL;
  if (trimmed.startsWith('#')) return trimmed;
  return `#${trimmed}`;
}

/**
 * Shared modal that wraps `reanimated-color-picker` with the project's
 * existing modal styling. Composes Panel1 (HSV panel) + HueSlider +
 * Preview + InputWidget so users can pick a color visually or type a
 * hex code. A row of presets (if provided) is rendered above the picker
 * for one-tap selection.
 */
export default function HexColorPickerModal({
  visible,
  initialColor,
  presets,
  presetTestIdPrefix,
  presetIds,
  allowClear = false,
  clearTestID = 'hex-color-picker-clear',
  cancelTestID = 'hex-color-picker-cancel',
  confirmTestID = 'hex-color-picker-confirm',
  title = 'Pick a color',
  onClose,
  onSelect,
}: HexColorPickerModalProps) {
  const { colors } = useTheme();

  const initial = normalizeHex(initialColor);
  const [currentHex, setCurrentHex] = useState<string>(initial);

  // Re-seed the working color whenever the modal is (re-)opened with a
  // new initial value.
  useEffect(() => {
    if (visible) {
      setCurrentHex(normalizeHex(initialColor));
    }
  }, [visible, initialColor]);

  const handleConfirm = () => {
    onSelect(currentHex);
    onClose();
  };

  const handleClear = () => {
    onSelect(null);
    onClose();
  };

  const handlePreset = (hex: string) => {
    onSelect(hex);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      contentStyle={{ padding: 20, minWidth: 320 }}
    >
      <View testID="hex-color-picker">
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

        {presets && presets.length > 0 ? (
          <View style={styles.presetsRow}>
            {presets.map((hex, idx) => {
              const presetId = presetIds?.[idx] ?? hex;
              const testID = presetTestIdPrefix
                ? `${presetTestIdPrefix}-${presetId}`
                : `hex-color-preset-${presetId}`;
              return (
                <Pressable
                  key={`${presetId}-${idx}`}
                  testID={testID}
                  accessibilityRole="button"
                  accessibilityLabel={`color ${presetId}`}
                  onPress={() => handlePreset(hex)}
                  style={({ pressed }) => [
                    styles.presetSwatch,
                    {
                      backgroundColor: hex,
                      borderColor: colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                />
              );
            })}
          </View>
        ) : null}

        <ColorPicker
          value={currentHex}
          sliderThickness={20}
          thumbSize={22}
          thumbShape="circle"
          onCompleteJS={(c) => setCurrentHex(c.hex)}
          style={styles.picker}
        >
          <Preview style={styles.preview} hideInitialColor={false} />
          <Panel1 style={styles.panel} />
          <HueSlider style={styles.slider} />
          <InputWidget
            iconColor={colors.text}
            inputStyle={[styles.input, { color: colors.text, borderColor: colors.border }]}
            inputTitleStyle={{ color: colors.textSecondary }}
            disableAlphaChannel
            formats={['HEX', 'RGB', 'HSL']}
            defaultFormat="HEX"
          />
        </ColorPicker>

        <View style={styles.actionsRow}>
          {allowClear ? (
            <TouchableOpacity
              testID={clearTestID}
              accessibilityRole="button"
              onPress={handleClear}
              style={[styles.clearButton, { borderColor: colors.border }]}
            >
              <Ionicons name="close-circle-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.clearText, { color: colors.text }]}>None</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            testID={cancelTestID}
            accessibilityRole="button"
            onPress={onClose}
            style={styles.cancelButton}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID={confirmTestID}
            accessibilityRole="button"
            onPress={handleConfirm}
            style={[styles.confirmButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.confirmText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  presetSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  picker: {
    width: '100%',
    gap: 12,
  },
  preview: {
    height: 36,
    borderRadius: 8,
  },
  panel: {
    height: 200,
    borderRadius: 12,
  },
  slider: {
    borderRadius: 999,
  },
  input: {
    fontSize: 13,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 'auto',
  },
  clearText: {
    fontSize: 14,
    fontWeight: '500',
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
  },
  confirmButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  confirmText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});

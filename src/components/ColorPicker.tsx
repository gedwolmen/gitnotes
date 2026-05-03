import React from 'react';

import HexColorPickerModal from './HexColorPickerModal';
import { NOTE_COLORS } from '../theme/tokens';
import { NoteColor, NOTE_COLOR_VALUES } from '../models/Note';

export interface ColorPickerProps {
  visible: boolean;
  onClose: () => void;
  // null = clear / "None"; a NoteColor value = set
  onSelect: (color: NoteColor | null) => void;
  selected?: NoteColor | null;
  title?: string;
}

/**
 * Snap an arbitrary hex color (e.g. '#aabbcc') to the nearest entry in
 * `NOTE_COLOR_VALUES` by squared RGB distance. The note model only
 * accepts the named preset enum, so any free-picker output is coerced
 * to the closest preset on save.
 */
export function snapToPresetColor(hex: string): NoteColor {
  const rgb = parseHex(hex);
  if (!rgb) {
    // Fallback: deterministic default if the input is unparseable.
    return NOTE_COLOR_VALUES[0];
  }

  let bestColor: NoteColor = NOTE_COLOR_VALUES[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const color of NOTE_COLOR_VALUES) {
    const presetRgb = parseHex(NOTE_COLORS[color]);
    if (!presetRgb) continue;
    const dr = rgb.r - presetRgb.r;
    const dg = rgb.g - presetRgb.g;
    const db = rgb.b - presetRgb.b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestColor = color;
    }
  }
  return bestColor;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const cleaned = hex.trim().replace(/^#/, '');
  let normalized: string;
  if (cleaned.length === 3) {
    normalized = cleaned
      .split('')
      .map((c) => c + c)
      .join('');
  } else if (cleaned.length === 6 || cleaned.length === 8) {
    normalized = cleaned.slice(0, 6);
  } else {
    return null;
  }
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

export default function ColorPicker({
  visible,
  onClose,
  onSelect,
  selected,
  title = 'Color',
}: ColorPickerProps) {
  const initialHex = selected ? NOTE_COLORS[selected] : undefined;

  const presetHexes = NOTE_COLOR_VALUES.map((c) => NOTE_COLORS[c]);
  const presetIds = NOTE_COLOR_VALUES.slice();

  const handleSelect = (hex: string | null) => {
    if (hex === null) {
      onSelect(null);
      return;
    }
    onSelect(snapToPresetColor(hex));
  };

  return (
    <HexColorPickerModal
      visible={visible}
      initialColor={initialHex}
      title={title}
      presets={presetHexes}
      presetIds={presetIds}
      presetTestIdPrefix="color-picker-swatch"
      allowClear
      clearTestID="color-picker-none"
      cancelTestID="color-picker-cancel"
      confirmTestID="color-picker-confirm"
      onClose={onClose}
      onSelect={handleSelect}
    />
  );
}

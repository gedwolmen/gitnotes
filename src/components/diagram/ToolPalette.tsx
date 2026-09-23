/**
 * Touch tool palette for diagram editor.
 *
 * Provides access to drawing tools, color selection, undo/redo,
 * and export actions.
 */

import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { InkColor } from '../../models/Diagram';
import { useTheme } from '../../contexts/ThemeContext';
import {
  TOOLS,
  type ToolKey,
  INK_COLORS,
  INK_HEX,
} from './types';

interface ToolPaletteProps {
  activeTool: ToolKey;
  activeColor: InkColor;
  onToolChange: (t: ToolKey) => void;
  onColorChange: (c: InkColor) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExportJson: () => void;
  onExportAscii: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
}

export function ToolPalette({
  activeTool,
  activeColor,
  onToolChange,
  onColorChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExportJson,
  onExportAscii,
  onDeleteSelected,
  hasSelection,
}: ToolPaletteProps) {
  const { colors } = useTheme();
  const [showColors, setShowColors] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {/* Tool buttons */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
        {TOOLS.map((tool) => (
          <TouchableOpacity
            key={tool.key}
            testID={`diagram-tool.${tool.key}`}
            accessibilityLabel={tool.label}
            accessibilityRole="button"
            accessibilityState={{ selected: activeTool === tool.key }}
            style={[
              styles.toolButton,
              activeTool === tool.key && { backgroundColor: colors.primary + '20' },
            ]}
            onPress={() => onToolChange(tool.key)}
          >
            <Ionicons
              name={tool.icon}
              size={22}
              color={activeTool === tool.key ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
        ))}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Undo/Redo */}
        <TouchableOpacity
          testID="diagram-tool.undo"
          accessibilityLabel="Undo"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canUndo }}
          style={[styles.toolButton, !canUndo && styles.disabled]}
          onPress={onUndo}
          disabled={!canUndo}
        >
          <Ionicons name="arrow-undo-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          testID="diagram-tool.redo"
          accessibilityLabel="Redo"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canRedo }}
          style={[styles.toolButton, !canRedo && styles.disabled]}
          onPress={onRedo}
          disabled={!canRedo}
        >
          <Ionicons name="arrow-redo-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Color picker */}
        <TouchableOpacity
          testID="diagram-tool.color"
          accessibilityLabel="Color"
          accessibilityRole="button"
          style={styles.toolButton}
          onPress={() => setShowColors(!showColors)}
        >
          <View style={[styles.colorSwatch, { backgroundColor: INK_HEX[activeColor] }]} />
        </TouchableOpacity>

        {/* Delete selected */}
        {hasSelection && (
          <TouchableOpacity
            testID="diagram-tool.delete"
            accessibilityLabel="Delete selected"
            accessibilityRole="button"
            style={styles.toolButton}
            onPress={onDeleteSelected}
          >
            <Ionicons name="trash-outline" size={22} color="#FF3B30" />
          </TouchableOpacity>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Export */}
        <TouchableOpacity
          testID="diagram-tool.export-json"
          accessibilityLabel="Export JSON"
          accessibilityRole="button"
          style={styles.toolButton}
          onPress={onExportJson}
        >
          <Ionicons name="download-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          testID="diagram-tool.export-ascii"
          accessibilityLabel="Export ASCII"
          accessibilityRole="button"
          style={styles.toolButton}
          onPress={onExportAscii}
        >
          <Ionicons name="code-slash-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>

      {/* Color picker popover */}
      {showColors && (
        <View style={[styles.popover, { backgroundColor: colors.surface }]}>
          {INK_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              testID={`diagram-color.${c}`}
              accessibilityLabel={c}
              style={[
                styles.colorOption,
                { backgroundColor: INK_HEX[c] },
                activeColor === c && { borderColor: colors.primary, borderWidth: 2 },
              ]}
              onPress={() => {
                onColorChange(c);
                setShowColors(false);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },
  toolButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  divider: {
    width: 1,
    height: 28,
    marginHorizontal: 4,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  popover: {
    position: 'absolute',
    bottom: 56,
    left: 16,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
});

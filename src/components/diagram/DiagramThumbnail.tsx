/**
 * ASCII-based diagram thumbnail.
 *
 * Renders a scaled-down ASCII representation of a diagram document
 * for use in card and list views.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Diagram } from '../../models/Diagram';
import { exportAscii } from '../../services/diagram/core/ascii';
import { useTheme } from '../../contexts/ThemeContext';

interface DiagramThumbnailProps {
  diagram: Diagram;
  width: number;
  height: number;
}

const MAX_ASCII_ROWS = 12;
const MAX_ASCII_COLS = 40;

export default function DiagramThumbnail({ diagram, width, height }: DiagramThumbnailProps) {
  const { colors } = useTheme();

  const asciiPreview = useMemo(() => {
    if (!diagram.document || diagram.document.objects.length === 0) {
      return null;
    }

    const ascii = exportAscii(diagram.document);
    const lines = ascii.split('\n');

    // Limit to visible area
    const visibleLines = lines.slice(0, MAX_ASCII_ROWS);
    const truncated = visibleLines.map((line) => {
      if (line.length > MAX_ASCII_COLS) {
        return line.slice(0, MAX_ASCII_COLS - 1) + '…';
      }
      return line;
    });

    return truncated.join('\n');
  }, [diagram.document]);

  if (!asciiPreview) {
    return (
      <View
        style={[
          styles.empty,
          {
            width,
            height,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
        pointerEvents="none"
      >
        <Ionicons name="grid-outline" size={Math.min(width, height) * 0.4} color={colors.textSecondary} />
      </View>
    );
  }

  // Calculate font size to fit the preview
  const padding = 4;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const charWidth = 7;
  const lineHeight = 12;
  const fontSize = Math.min(
    availableWidth / MAX_ASCII_COLS / charWidth * 10,
    availableHeight / MAX_ASCII_ROWS / lineHeight * 10,
    10,
  );

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          backgroundColor: colors.background,
        },
      ]}
      pointerEvents="none"
    >
      <Text
        style={[
          styles.ascii,
          {
            fontSize,
            lineHeight: fontSize * 1.2,
            color: colors.text,
          },
        ]}
        selectable={false}
      >
        {asciiPreview}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 6,
    overflow: 'hidden',
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ascii: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    includeFontPadding: false,
  },
  empty: {
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

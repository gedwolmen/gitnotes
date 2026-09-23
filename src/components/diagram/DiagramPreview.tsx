/**
 * Diagram preview component — shown when previewing a diagram before opening.
 *
 * Displays a larger ASCII preview of the diagram with metadata.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { Diagram } from '../../models/Diagram';
import { useTheme } from '../../contexts/ThemeContext';
import { exportAscii } from '../../services/diagram/core/ascii';
import type { RootStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface DiagramPreviewProps {
  diagram: Diagram;
}

const MAX_ASCII_ROWS = 20;
const MAX_ASCII_COLS = 60;

export default function DiagramPreview({ diagram }: DiagramPreviewProps) {
  const navigation = useNavigation<NavigationProp>();
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

  const handleOpen = () => {
    navigation.navigate('DiagramEditor', { diagramId: diagram.id });
  };

  if (!asciiPreview) {
    return (
      <View
        style={[
          styles.missing,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Ionicons name="grid-outline" size={20} color={colors.textSecondary} />
        <Text style={[styles.missingText, { color: colors.textSecondary }]}>
          Diagram is empty
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      testID={`diagram-preview.button.open-${diagram.id}`}
      onPress={handleOpen}
      activeOpacity={0.8}
      style={[styles.container, { borderColor: colors.border }]}
    >
      <View style={styles.canvasWrap}>
        <Text
          style={[
            styles.asciiPreview,
            {
              color: colors.text,
            },
          ]}
          selectable={false}
        >
          {asciiPreview}
        </Text>
      </View>
      <View style={[styles.footer, { backgroundColor: colors.surface }]}>
        <Ionicons name="grid" size={14} color={colors.accent} />
        <Text style={[styles.footerText, { color: colors.text }]}>
          {diagram.title || 'Untitled Diagram'}
        </Text>
        <Text style={[styles.footerMeta, { color: colors.textSecondary }]}>
          {diagram.document.objects.length} objects
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 8,
    height: 220,
  },
  canvasWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 8,
  },
  asciiPreview: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 8,
    lineHeight: 10,
    includeFontPadding: false,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  footerMeta: {
    fontSize: 12,
  },
  missing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  missingText: {
    fontSize: 14,
  },
});

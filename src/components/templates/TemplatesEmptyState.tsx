import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { styles } from './templateManagerStyles';

export function TemplatesEmptyState() {
  const { colors } = useTheme();

  return (
    <View style={styles.empty}>
      <Ionicons name="document-text-outline" size={42} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No templates yet</Text>
      <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Create your first custom template to get started.</Text>
    </View>
  );
}

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { formatChecklistProgress } from '../utils/checklist';
import { Surface } from './ui';

interface ChecklistProgressProps {
  total: number;
  completed: number;
  showPercentage?: boolean;
}

export default function ChecklistProgress({
  total,
  completed,
  showPercentage = true,
}: ChecklistProgressProps) {
  const { colors } = useTheme();

  if (total === 0) return null;

  const percentage = total > 0 ? (completed / total) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.progressRow}>
        <Surface elevation="subtle" radius="pill" inset style={styles.progressBar}>
          <View
            style={{
              height: '100%',
              borderRadius: 999,
              backgroundColor: completed === total ? colors.accent : colors.accentMuted,
              width: `${percentage}%`,
            }}
          />
        </Surface>
        <Text style={[styles.progressText, { color: colors.textSecondary }]}>
          {showPercentage
            ? formatChecklistProgress({ total, completed })
            : `${completed}/${total}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  progressText: {
    fontSize: 12,
    minWidth: 60,
    textAlign: 'right',
  },
});

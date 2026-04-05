import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { formatChecklistProgress } from '../utils/checklist';

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
        <View
          style={[
            styles.progressBar,
            { backgroundColor: colors.border },
          ]}
        >
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: completed === total ? colors.primary : colors.primary + '80',
                width: `${percentage}%`,
              },
            ]}
          />
        </View>
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
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    minWidth: 60,
    textAlign: 'right',
  },
});
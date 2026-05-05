import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { format, isToday, isYesterday } from 'date-fns';
import { useTheme } from '../../contexts/ThemeContext';

interface JournalDateHeaderProps {
  date: Date;
}

export function JournalDateHeader({ date }: JournalDateHeaderProps) {
  const { colors } = useTheme();

  let label: string;
  if (isToday(date)) {
    label = 'Today';
  } else if (isYesterday(date)) {
    label = 'Yesterday';
  } else {
    label = format(date, 'EEEE, MMMM d, yyyy');
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Text style={[styles.label, { color: colors.text }]}>
        {label}
      </Text>
      {!isToday(date) && !isYesterday(date) && (
        <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
          {format(date, 'MMMM d')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  subLabel: {
    fontSize: 12,
    marginTop: 1,
  },
});

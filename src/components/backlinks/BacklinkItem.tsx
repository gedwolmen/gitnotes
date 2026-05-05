import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface BacklinkItemProps {
  title: string;
  snippet: string;
  onPress: () => void;
}

export function BacklinkItem({ title, snippet, onPress }: BacklinkItemProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <Text style={styles.snippet} numberOfLines={2}>{snippet}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8, paddingHorizontal: 12 },
  title: { fontSize: 14, fontWeight: '600' },
  snippet: { fontSize: 12, opacity: 0.7, marginTop: 2 },
});

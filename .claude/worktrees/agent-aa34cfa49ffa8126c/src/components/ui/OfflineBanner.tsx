import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useTheme } from '../../contexts/ThemeContext';

export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();
  const { colors } = useTheme();

  if (isConnected) return null;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: `${colors.error}20`, borderColor: `${colors.error}33` },
      ]}
    >
      <Text style={[styles.text, { color: colors.error }]}>You're offline — changes won't sync</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});

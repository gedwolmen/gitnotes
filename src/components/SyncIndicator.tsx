import React from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { SyncStatus } from '../contexts/GitSyncContext';

interface SyncIndicatorProps {
  status: SyncStatus;
  pendingChanges?: number;
  onSyncPress?: () => void;
}

export default function SyncIndicator({ status, pendingChanges = 0, onSyncPress }: SyncIndicatorProps) {
  const { colors } = useTheme();

  const getIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'pulling':
      case 'pushing':
        return 'sync';
      case 'merging':
        return 'git-merge';
      case 'error':
        return 'cloud-offline';
      case 'idle':
      default:
        return 'cloud';
    }
  };

  const getColor = (): string => {
    if (status === 'error') return '#FF3B30';
    if (status === 'pulling' || status === 'pushing' || status === 'merging') return colors.primary;
    return colors.textSecondary;
  };

  const isSyncing = status === 'pulling' || status === 'pushing' || status === 'merging';

  return (
    <TouchableOpacity
      onPress={onSyncPress}
      disabled={isSyncing || !onSyncPress}
      style={styles.container}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <View style={styles.iconContainer}>
        {isSyncing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name={getIcon()} size={20} color={getColor()} />
        )}

        {pendingChanges > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            {pendingChanges > 9 ? (
              <Ionicons name="ellipsis-horizontal" size={8} color="#FFF" />
            ) : null}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
});
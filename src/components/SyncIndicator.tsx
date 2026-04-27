import React from 'react';
import { View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { SyncStatus } from '../contexts/GitSyncContext';
import { Surface } from './neumorphic';

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
    if (status === 'error') return colors.error;
    if (status === 'pulling' || status === 'pushing' || status === 'merging') return colors.accent;
    return colors.textSecondary;
  };

  const isSyncing = status === 'pulling' || status === 'pushing' || status === 'merging';

  return (
    <Pressable
      onPress={onSyncPress}
      disabled={isSyncing || !onSyncPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Surface elevation="subtle" radius="pill" style={styles.container}>
        <View style={styles.iconContainer}>
          {isSyncing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name={getIcon()} size={18} color={getColor()} />
          )}

          {pendingChanges > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              {pendingChanges > 9 ? (
                <Ionicons name="ellipsis-horizontal" size={8} color="#FFF" />
              ) : null}
            </View>
          )}
        </View>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
});

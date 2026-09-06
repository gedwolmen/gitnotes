import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTokens } from '../contexts/ThemeContext';
import { useGitHubActivityStore, SyncProgress } from '../stores/githubActivityStore';
import { NoteSyncQueueService } from '../services/cloneSyncServiceImpl';

function ProgressBar({ progress, color }: { progress: SyncProgress; color: string }) {
  const percentage = progress.total != null && progress.total > 0
    ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
    : null;
  return (
    <View style={progressBarStyles.container}>
      <View style={[progressBarStyles.track, { backgroundColor: color + '30' }]}>
        {percentage != null ? (
          <View style={[progressBarStyles.fill, { width: `${percentage}%`, backgroundColor: color }]} />
        ) : (
          <Animated.View
            style={[progressBarStyles.indeterminate, { backgroundColor: color }]}
 />
        )}
      </View>
      {percentage != null && (
        <Text style={progressBarStyles.label}>{percentage}%</Text>
      )}
    </View>
  );
}

const progressBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 80,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  indeterminate: {
    width: '40%',
    height: '100%',
    borderRadius: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'right',
  },
});

export function GitHubActivityIndicator() {
  const { colors, radii, spacing, type } = useTokens();
  const visible = useGitHubActivityStore((s) => s.visible);
  const label = useGitHubActivityStore((s) => s.label);
  const progress = useGitHubActivityStore((s) => s.progress);
  const [pendingCount, setPendingCount] = useState(0);

  const safeLabel = (label ?? 'Syncing with GitHub').replace(/…+$/, '');

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    const refreshPending = () => {
      NoteSyncQueueService.pendingCount().then(setPendingCount);
    };
    refreshPending();
    const unsubscribe = NoteSyncQueueService.subscribe(refreshPending);
    return unsubscribe;
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : -12,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, translateY]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { opacity, transform: [{ translateY }] }]}
      testID="github-activity-indicator"
    >
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.pill,
              paddingVertical: spacing[2],
              paddingHorizontal: spacing[3],
              gap: spacing[2],
            },
          ]}
        >
          <ActivityIndicator size="small" color={colors.accent} />
          <Text
            style={{ color: colors.text, fontSize: type.sm, fontWeight: '600' }}
            numberOfLines={1}
          >
            {safeLabel}
            {pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
          </Text>
          {progress && <ProgressBar progress={progress} color={colors.accent} />}
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 10,
  },
  safe: {
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});

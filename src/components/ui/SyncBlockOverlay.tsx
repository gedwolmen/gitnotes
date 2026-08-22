import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';

import { useTheme, useTokens } from '../../contexts/ThemeContext';
import { useGitOperationStore, GIT_OP_ALL_REPOS } from '../../stores/gitOperationStore';
import { GitSyncGate } from '../../services/git/GitSyncGate';
import { cancelInflightGitHttp } from '../../services/git/gitHttp';
import { HapticService } from '../../utils/haptics';

/**
 * Full-screen blocking overlay shown during foreground sync cycles (#926).
 * Blocks pointer events and announces via VoiceOver so the user knows an
 * in-flight save or manual sync is occupying the sync gate. Hidden for
 * idle / background / startup cycles (non-blocking pill handles those).
 *
 * A Cancel button appears once the block has lasted CANCEL_ARM_MS so a
 * stuck push/fetch can be escaped instead of forcing a force-quit (#1013).
 */

const CANCEL_ARM_MS = 5_000;

function useBlockingSyncVisible(): boolean {
  return useGitOperationStore((s) =>
    Object.values(s.ops).some(
      (op) =>
        (op.status === 'queued' || op.status === 'running') &&
        op.kind === 'pull' &&
        op.repo === GIT_OP_ALL_REPOS &&
        (op.source === 'save' || op.source === 'manual'),
    ),
  );
}

export function SyncBlockOverlay() {
  const visible = useBlockingSyncVisible();
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const { colors, spacing, type } = useTokens();
  const opacity = useRef(new Animated.Value(0)).current;
  const prevVisibleRef = useRef(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Pick label: "pushing" when push markers are active, else "syncing".
  const hasPushMarkers = GitSyncGate.isPushActive();
  const label = hasPushMarkers ? t('sync.overlay.pushing') : t('sync.overlay.syncing');

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  // Arm the cancel button only after the block has persisted — short syncs
  // are normal and shouldn't invite cancelling.
  useEffect(() => {
    if (!visible) {
      setCancelArmed(false);
      setCancelling(false);
      return;
    }
    const timer = setTimeout(() => setCancelArmed(true), CANCEL_ARM_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const handleCancel = () => {
    if (cancelling) return;
    setCancelling(true);
    void HapticService.error();
    cancelInflightGitHttp();
  };

  // Announce to VoiceOver / TalkBack on visible→true transition only.
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      AccessibilityInfo.announceForAccessibility(label);
    }
    prevVisibleRef.current = visible;
  }, [visible, label]);

  return (
    <Animated.View
      testID="sync-block-overlay"
      pointerEvents={visible ? 'auto' : 'none'}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={label}
      style={[styles.root, { opacity }]}
    >
      <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.scrim} />
      <Pressable style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { gap: spacing[2] }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ color: colors.text, fontSize: type.sm, fontWeight: '600' }} numberOfLines={1}>
          {label}
        </Text>
        {cancelArmed && (
          <Pressable
            testID="sync-block-overlay.cancel"
            onPress={handleCancel}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cancelButton,
              { backgroundColor: pressed ? colors.shadow + '30' : colors.shadow + '14' },
            ]}
          >
            <Text style={{ color: colors.text, fontSize: type.sm, fontWeight: '600' }}>
              {cancelling ? t('sync.overlay.cancelling') : t('sync.overlay.cancel')}
            </Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    // Above the GitHub activity indicator pill (zIndex 1000) but below
    // BiometricLockScreen (no explicit zIndex — last rendered wins).
    zIndex: 1001,
    elevation: 11,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
  },
});

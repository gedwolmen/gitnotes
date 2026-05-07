import React from 'react';
import { Text, View } from 'react-native';
import { Button, Modal } from '../ui';
import { useTheme, useTokens } from '../../contexts/ThemeContext';

export interface CloneProgress {
  repoName: string;
  phase: string;
  loaded: number;
  total: number | null;
}

interface CloneProgressModalProps {
  progress: CloneProgress | null;
  onCancel: () => void;
}

/**
 * Blocking bottom-sheet shown while a repo clone is in flight (#538).
 * Background blur + dismissOnBackdrop=false so the user can't navigate
 * away mid-clone — the only escape is the Cancel button, which signals
 * the abort flag the SettingsScreen owns.
 */
export function CloneProgressModal({ progress, onCancel }: CloneProgressModalProps) {
  const { colors } = useTheme();
  const { spacing, type } = useTokens();

  const visible = progress !== null;
  const pct =
    progress && progress.total && progress.total > 0
      ? Math.min(1, progress.loaded / progress.total)
      : null;
  const pctLabel = pct !== null ? `${Math.round(pct * 100)}%` : '…';

  return (
    <Modal
      visible={visible}
      onRequestClose={onCancel}
      dismissOnBackdrop={false}
      bottomSheet
      contentStyle={{ padding: spacing[5], paddingBottom: spacing[6] + 18 }}
    >
      <Text style={{ color: colors.text, fontSize: type.lg, fontWeight: '600', marginBottom: spacing[1] }}>
        Cloning {progress?.repoName ?? ''}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: type.sm, marginBottom: spacing[4] }}>
        {progress?.phase ?? 'Preparing…'} · {pctLabel}
      </Text>

      <View
        style={{
          height: 6,
          borderRadius: 999,
          overflow: 'hidden',
          backgroundColor: colors.border,
          marginBottom: spacing[5],
        }}
      >
        <View
          style={{
            height: '100%',
            width: pct !== null ? `${Math.round(pct * 100)}%` : '40%',
            backgroundColor: colors.primary,
          }}
        />
      </View>

      <Button testID="clone-progress.button.cancel" label="Cancel" onPress={onCancel} variant="secondary" />
    </Modal>
  );
}

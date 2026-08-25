import { memo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Modal } from '../ui';
import { useTheme, useTokens } from '../../contexts/ThemeContext';

export interface CloneProgress {
  repoName: string;
  phase: string;
  loaded: number;
  total: number | null;
  error?: string;
}

interface CloneProgressModalProps {
  progress: CloneProgress | null;
  onCancel: () => void;
  onRetry?: () => void;
}

/**
 * The clone/import progress UI, decoupled from the native Modal wrapper so it
 * can be rendered inline inside the Add-Repository picker bottom sheet as well
 * as standalone. The picker path MUST NOT stack a second native Modal on top of
 * the open picker modal — iOS Fabric rejects the presentation
 * ("Attempt to present ... which is already presenting"), which silently
 * swallowed the progress UI and left users staring at an endless row spinner.
 */
function CloneProgressSpinner({ phase }: { phase: string }) {
  const { colors } = useTheme();
  const { spacing, type } = useTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] }}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={{ color: colors.textSecondary, fontSize: type.sm }}>
        {phase}
      </Text>
    </View>
  );
}

export const CloneProgressContent = memo(function CloneProgressContent({
  progress,
  onCancel,
  onRetry,
}: {
  progress: CloneProgress;
  onCancel: () => void;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  const { spacing, type } = useTokens();

  const hasError = progress.error !== undefined;
  const pct =
    progress.total && progress.total > 0
      ? Math.min(1, progress.loaded / progress.total)
      : null;
  const pctLabel = pct !== null ? `${Math.round(pct * 100)}%` : '…';

  return (
    <>
      <Text style={{ color: colors.text, fontSize: type.lg, fontWeight: '600', marginBottom: spacing[1] }}>
        {hasError ? 'Clone Failed' : `Cloning ${progress.repoName}`}
      </Text>

      {hasError ? (
        <>
          <Text style={{ color: colors.error, fontSize: type.sm, marginBottom: spacing[3] }}>
            {progress.error}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: type.xs, marginBottom: spacing[4] }}>
            Tip: Large repos may fail due to network issues. Try again or use a smaller repo first.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing[4], marginTop: spacing[2] }}>
            <Button label="Cancel" onPress={onCancel} variant="secondary" style={{ flex: 1 }} />
            {onRetry && (
              <Button label="Retry" onPress={onRetry} variant="primary" style={{ flex: 1 }} />
            )}
          </View>
        </>
      ) : (
        <>
          {progress.total === null ? (
            <CloneProgressSpinner phase={progress.phase} />
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: type.sm, marginBottom: spacing[4] }}>
              {progress.phase} · {pctLabel}
            </Text>
          )}

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

          <Text style={{ color: colors.textSecondary, fontSize: type.xs, textAlign: 'center', marginTop: spacing[3] }}>
            Cloning may take 1–10 minutes depending on repo size
          </Text>
        </>
      )}
    </>
  );
});

export function CloneProgressModal({ progress, onCancel, onRetry }: CloneProgressModalProps) {
  const { spacing } = useTokens();

  const visible = progress !== null;

  return (
    <Modal
      visible={visible}
      onRequestClose={onCancel}
      dismissOnBackdrop={false}
      bottomSheet
      contentStyle={{ padding: spacing[5], paddingBottom: spacing[6] + 18 }}
    >
      {progress ? (
        <CloneProgressContent progress={progress} onCancel={onCancel} onRetry={onRetry} />
      ) : null}
    </Modal>
  );
}

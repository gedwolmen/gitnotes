import React from 'react';
import { Text, View } from 'react-native';
import { Button, Surface } from '../ui';

type Props = {
  message: string | null;
  colors: { text: string };
  spacing: Record<number, number>;
  type: { md: number };
  canRetry: boolean;
  isStreaming: boolean;
  onRetry: () => void;
  onDismiss: () => void;
};

export function ChatErrorCard({ message, colors, spacing, type, canRetry, isStreaming, onRetry, onDismiss }: Props) {
  if (!message) return null;

  return (
    <Surface
      elevation="raised"
      radius="md"
      style={{ marginHorizontal: spacing[4], marginBottom: spacing[3], padding: spacing[4], borderWidth: 1, borderColor: '#d66b6b' }}
    >
      <Text style={{ color: colors.text, fontSize: type.md, fontWeight: '600', marginBottom: spacing[2] }}>{message}</Text>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <Button variant="primary" onPress={onRetry} disabled={!canRetry || isStreaming}>Retry</Button>
        <Button variant="secondary" onPress={onDismiss}>Dismiss</Button>
      </View>
    </Surface>
  );
}

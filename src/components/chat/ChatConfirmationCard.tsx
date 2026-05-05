import React from 'react';
import { Text, View } from 'react-native';
import { Button, Surface } from '../ui';
import type { PendingConfirmation } from './chatScreenShared';

type Props = {
  pendingConfirmation: PendingConfirmation | null;
  colors: { text: string; textSecondary: string; accent: string };
  spacing: Record<number, number>;
  type: { lg: number; sm: number };
  onApply: () => void;
  onCancel: () => void;
};

export function ChatConfirmationCard({ pendingConfirmation, colors, spacing, type, onApply, onCancel }: Props) {
  if (!pendingConfirmation) return null;

  return (
    <Surface
      elevation="raised"
      radius="md"
      style={{ marginHorizontal: spacing[4], marginBottom: spacing[3], padding: spacing[4], borderWidth: 1, borderColor: colors.accent }}
    >
      <Text style={{ color: colors.text, fontSize: type.lg, fontWeight: '700', marginBottom: spacing[2] }}>
        {pendingConfirmation.description}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: type.sm, marginBottom: spacing[3] }}>
        {JSON.stringify(pendingConfirmation.details, null, 2)}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <Button variant="primary" onPress={onApply} style={{ flex: 1 }}>Apply</Button>
        <Button variant="secondary" onPress={onCancel} style={{ flex: 1 }}>Cancel</Button>
      </View>
    </Surface>
  );
}

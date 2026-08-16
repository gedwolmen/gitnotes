import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  if (!pendingConfirmation) return null;

  return (
    <Surface
      elevation="raised"
      radius="md"
      className="mx-4 mb-3 p-4 border border-accent"
    >
      <Text className="text-lg font-bold mb-2 text-text">
        {pendingConfirmation.description}
      </Text>
      <Text className="text-sm mb-3 text-text-secondary">
        {JSON.stringify(pendingConfirmation.details, null, 2)}
      </Text>
      <View className="flex-row gap-2">
        <Button testID="chat-confirmation.button.apply" variant="primary" onPress={onApply} style={{ flex: 1 }}>{t('common.apply')}</Button>
        <Button testID="chat-confirmation.button.cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }}>{t('common.cancel')}</Button>
      </View>
    </Surface>
  );
}

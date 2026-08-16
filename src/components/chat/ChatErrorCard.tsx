import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  if (!message) return null;

  return (
    <Surface
      elevation="raised"
      radius="md"
      className="mx-4 mb-3 p-4 border border-error"
    >
      <Text className="text-md font-semibold mb-2 text-text">{message}</Text>
      <View className="flex-row gap-2">
        <Button testID="chat-error.button.retry" variant="primary" onPress={onRetry} disabled={!canRetry || isStreaming}>{t('common.retry')}</Button>
        <Button testID="chat-error.button.dismiss" variant="secondary" onPress={onDismiss}>{t('common.dismiss')}</Button>
      </View>
    </Surface>
  );
}

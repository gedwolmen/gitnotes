import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTokens } from '../../contexts/ThemeContext';

export interface ChatLoadingStripProps {
  visible: boolean;
  model?: string;
  provider?: string;
  startedAt: number;
  onCancel: () => void;
}

export function ChatLoadingStrip({ visible, model, provider, startedAt, onCancel }: ChatLoadingStripProps) {
  const { colors, spacing, type, radii } = useTokens();
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - startedAt));

  useEffect(() => {
    if (!visible) return;
    setElapsedMs(Math.max(0, Date.now() - startedAt));
    const id = setInterval(() => setElapsedMs(Math.max(0, Date.now() - startedAt)), 100);
    return () => clearInterval(id);
  }, [visible, startedAt]);

  if (!visible) return null;

  const pillLabel = [model, provider].filter(Boolean).join(' · ') || 'AI';

  return (
    <View
      testID="chat.status.strip"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Generating with ${pillLabel}, ${(elapsedMs / 1000).toFixed(1)} seconds elapsed`}
      className="flex-row items-center bg-elevated border-t border-border px-3 py-2 gap-2"
    >
      <View
        className="flex-shrink rounded-sm px-2 py-1"
        style={{
          backgroundColor: colors.accent + '20',
          maxWidth: '60%',
        }}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          className="text-xs font-semibold text-accent"
        >
          {pillLabel}
        </Text>
      </View>

      <Text
        className="text-xs text-text-secondary"
        style={{
          fontVariant: ['tabular-nums'],
          fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
        }}
      >
        {(elapsedMs / 1000).toFixed(1)}s
      </Text>

      <View className="flex-1" />

      <Pressable
        testID="chat.status.cancel"
        accessibilityRole="button"
        accessibilityLabel="Cancel AI response"
        onPress={onCancel}
        hitSlop={8}
        className="flex-row items-center gap-1"
      >
        <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
        <Text className="text-xs text-text-secondary">Cancel</Text>
      </Pressable>
    </View>
  );
}

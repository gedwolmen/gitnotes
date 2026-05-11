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
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.elevated,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingHorizontal: spacing[3],
        paddingVertical: spacing[2],
        gap: spacing[2],
      }}
    >
      <View
        style={{
          flexShrink: 1,
          backgroundColor: colors.accent + '20',
          borderRadius: radii.sm,
          paddingHorizontal: spacing[2],
          paddingVertical: spacing[1],
          maxWidth: '60%',
        }}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ fontSize: type.xs, color: colors.accent, fontWeight: '600' }}
        >
          {pillLabel}
        </Text>
      </View>

      <Text
        style={{
          fontSize: type.xs,
          color: colors.textSecondary,
          fontVariant: ['tabular-nums'],
          fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
        }}
      >
        {(elapsedMs / 1000).toFixed(1)}s
      </Text>

      <View style={{ flex: 1 }} />

      <Pressable
        testID="chat.status.cancel"
        accessibilityRole="button"
        accessibilityLabel="Cancel AI response"
        onPress={onCancel}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
      >
        <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
        <Text style={{ fontSize: type.xs, color: colors.textSecondary }}>Cancel</Text>
      </Pressable>
    </View>
  );
}

import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import type { PushFailure } from './pushErrors';

interface GitErrorBannerProps {
  failure: PushFailure;
  retrying: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

const KIND_ICON: Record<PushFailure['kind'], keyof typeof Ionicons.glyphMap> = {
  auth: 'key-outline',
  permission: 'lock-closed-outline',
  transport: 'cloud-offline-outline',
  rejected: 'git-merge-outline',
  corruption: 'medkit-outline',
  unknown: 'warning-outline',
};

/**
 * Inline error banner surfaced when a push fails. Shows the typed engine
 * error (auth / permission / transport / rejected / corruption), a Retry
 * action, and a dismiss control. Absolutely positioned by the parent above
 * the floating git button's docked corner.
 */
export default function GitErrorBanner({
  failure,
  retrying,
  onRetry,
  onDismiss,
}: GitErrorBannerProps) {
  return (
    <View
      testID="gitbutton.errorbanner"
      accessibilityRole="alert"
      className="w-[290px] rounded-xl border border-destructive/60 bg-popover p-3 shadow-lg"
    >
      <View className="flex-row items-center gap-2">
        <Ionicons name={KIND_ICON[failure.kind]} size={16} color="#e07a7a" />
        <Text className="flex-1 text-sm font-bold text-destructive">{failure.label}</Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          testID="gitbutton.errorbanner.dismiss"
          accessibilityRole="button"
          accessibilityLabel="Dismiss error"
        >
          <Ionicons name="close" size={16} color="#6e6e73" />
        </Pressable>
      </View>
      <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={3}>
        {failure.message}
      </Text>
      <View className="mt-2 flex-row justify-end">
        <Pressable
          onPress={onRetry}
          disabled={retrying}
          testID="gitbutton.errorbanner.retry"
          accessibilityRole="button"
          className={`rounded-sm px-3 py-1.5 ${retrying ? 'bg-muted' : 'bg-primary'}`}
        >
          <Text className={`text-xs font-semibold ${retrying ? 'text-muted-foreground' : 'text-primary-foreground'}`}>
            {retrying ? 'Retrying…' : 'Retry push'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

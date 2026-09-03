import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';

interface ConflictRouteBannerProps {
  fileCount: number;
  onResolve: () => void;
  onDismiss: () => void;
}

/**
 * Banner shown when a push-with-integrate lands on real merge conflicts:
 * routes the user to the Explore conflict surface. Dismissable; re-triggered
 * by the next conflict-producing push.
 */
export default function ConflictRouteBanner({
  fileCount,
  onResolve,
  onDismiss,
}: ConflictRouteBannerProps) {
  return (
    <View
      testID="gitbutton.conflictroutes"
      accessibilityRole="alert"
      className="w-[290px] rounded-xl border border-amber-500/60 bg-popover p-3 shadow-lg"
    >
      <View className="flex-row items-center gap-2">
        <Ionicons name="git-merge-outline" size={16} color="#d97706" />
        <Text className="flex-1 text-sm font-bold text-amber-600">
          {fileCount} conflicted file{fileCount === 1 ? '' : 's'}
        </Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          testID="gitbutton.conflictroutes.dismiss"
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={16} color="#6e6e73" />
        </Pressable>
      </View>
      <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={2}>
        The push diverged from the remote. Resolve the conflicts, then push
        again.
      </Text>
      <View className="mt-2 flex-row justify-end">
        <Pressable
          onPress={onResolve}
          testID="gitbutton.conflictroutes.resolve"
          accessibilityRole="button"
          className="rounded-sm bg-primary px-3 py-1.5"
        >
          <Text className="text-xs font-semibold text-primary-foreground">
            Resolve conflicts
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useConflictStore } from '../../stores/conflictStore';
import type { RootStackParamList } from '../../navigation/types';

const WARNING = '#f59e0b';
const WARNING_DARK = '#d97706';

export function ConflictBanner() {
  const unresolvedCount = useConflictStore((s) => s.totalUnresolvedFiles());
  const conflicts = useConflictStore((s) => s.conflicts);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handlePress = useCallback(() => {
    if (conflicts.length > 0) {
      navigation.navigate('SyncStatus');
    }
  }, [conflicts, navigation]);

  if (unresolvedCount === 0) return null;

  const label = unresolvedCount === 1
    ? '1 file needs merge'
    : `${unresolvedCount} files need merge`;

  return (
    <Pressable onPress={handlePress} className="active:opacity-70">
      <View
        className="mx-4 mb-3 px-3.5 py-2.5 rounded-[14px] border"
        style={{ backgroundColor: `${WARNING}20`, borderColor: `${WARNING}33` }}
      >
        <View className="flex-row items-center">
          <Ionicons name="warning" size={16} color={WARNING_DARK} />
          <Text className="text-sm font-semibold ml-1.5" style={{ color: WARNING_DARK }}>
            {label} — Tap to resolve
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useConflictStore } from '../../stores/conflictStore';

const WARNING = '#f59e0b';
const WARNING_DARK = '#d97706';

export function ConflictBanner() {
  const unresolvedCount = useConflictStore((s) => s.totalUnresolvedFiles());
  const conflicts = useConflictStore((s) => s.conflicts);
  const navigation = useNavigation();

  const handlePress = useCallback(() => {
    if (conflicts.length > 0) {
      (navigation as any).navigate('SyncStatus');
    }
  }, [conflicts, navigation]);

  if (unresolvedCount === 0) return null;

  const label = unresolvedCount === 1
    ? '1 file needs merge'
    : `${unresolvedCount} files need merge`;

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View
        style={[
          styles.banner,
          { backgroundColor: `${WARNING}20`, borderColor: `${WARNING}33` },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="warning" size={16} color={WARNING_DARK} />
          <Text style={[styles.text, { color: WARNING_DARK, marginLeft: 6 }]}>
            {label} — Tap to resolve
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});

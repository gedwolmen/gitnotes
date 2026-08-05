import React, { useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { useConflictStore } from '../stores/conflictStore';
import type { FileConflict } from '../services/conflict/types';
import type { RootStackParamList } from '../navigation/types';
import { ScreenHeader } from '../components/ui';

function formatChip(format: string): string {
  switch (format) {
    case 'text': return 'TXT';
    case 'json': return 'JSON';
    case 'binary': return 'BIN';
    default: return format.toUpperCase();
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'both-changed-different': return 'Needs attention';
    case 'local-deleted-remote-modified': return 'Deleted locally, modified remotely';
    case 'local-modified-remote-deleted': return 'Modified locally, deleted remotely';
    case 'both-renamed': return 'Renamed on both sides';
    default: return kind;
  }
}

export default function SyncStatusScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const conflicts = useConflictStore((s) => s.conflicts);
  const removeConflict = useConflictStore((s) => s.removeConflict);

  const allFiles: (FileConflict & { repoPath: string; branch: string })[] = [];
  for (const cs of conflicts) {
    for (const f of cs.files) {
      if (!f.autoResolved) {
        allFiles.push({ ...f, repoPath: cs.repoPath, branch: cs.branch });
      }
    }
  }

  const handleFilePress = useCallback(
    (item: FileConflict & { repoPath: string; branch: string }) => {
      navigation.navigate('ConflictResolver', {
        repoPath: item.repoPath,
        branch: item.branch,
        filePath: item.path,
      });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: FileConflict & { repoPath: string; branch: string } }) => (
      <TouchableOpacity
        onPress={() => handleFilePress(item)}
        className="flex-row items-center justify-between px-4 py-3.5 border-b"
        style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border }}
      >
        <View className="flex-1 mr-3">
          <Text className="text-[15px] font-medium" style={{ color: colors.text }} numberOfLines={1}>
            {item.path}
          </Text>
          <Text className="text-[13px] mt-0.5" style={{ color: colors.textSecondary }}>
            {kindLabel(item.kind)}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <View
            className="px-2 py-0.5 rounded-md"
            style={{ backgroundColor: `${colors.primary ?? colors.text}20` }}
          >
            <Text
              className="text-[11px] font-bold"
              style={{ color: colors.primary ?? colors.text }}
            >
              {formatChip(item.format)}
            </Text>
          </View>
          {!item.autoResolved && (
            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.error ?? '#ef4444' }} />
          )}
        </View>
      </TouchableOpacity>
    ),
    [colors, handleFilePress],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title="Sync Conflicts"
        onBack={() => navigation.goBack()}
      />

      {allFiles.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-base" style={{ color: colors.textSecondary }}>
            No unresolved conflicts
          </Text>
        </View>
      ) : (
        <FlatList
          data={allFiles}
          keyExtractor={(item) => `${item.repoPath}:${item.branch}:${item.path}`}
          renderItem={renderItem}
          contentContainerClassName="pb-8"
        />
      )}
    </SafeAreaView>
  );
}

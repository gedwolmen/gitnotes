import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { useConflictStore } from '../stores/conflictStore';
import { useAIStore } from '../stores/aiStore';
import { ConflictResolverService } from '../services/conflict/ConflictResolverService';
import { proposeMerge } from '../services/conflict/AiConflictResolver';
import type { FileConflict } from '../services/conflict/types';
import type { RootStackParamList } from '../navigation/types';
import { ScreenHeader } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { useSafeBack } from '../hooks/useSafeBack';

const MANAGE_THRESHOLD = 5;

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

function repoName(repoPath: string): string {
  const segments = repoPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? repoPath;
}

function groupKey(repoPath: string, branch: string): string {
  return `${repoPath}::${branch}`;
}

interface ConflictGroup {
  repoPath: string;
  branch: string;
  files: FileConflict[];
}

type Row =
  | { type: 'header'; key: string; group: ConflictGroup }
  | { type: 'file'; key: string; repoPath: string; branch: string; file: FileConflict };

interface SyncStatusScreenProps {
  onAiFixRemaining?: () => void;
}

export default function SyncStatusScreen({ onAiFixRemaining }: SyncStatusScreenProps = {}) {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const safeBack = useSafeBack();
  const route = useRoute<RouteProp<RootStackParamList, 'Conflicts'>>();
  const conflicts = useConflictStore((s) => s.conflicts);
  const hasAiModel = useAIStore((s) => s.getSelectedModel() !== undefined);

  const isManageMode = route.params?.mode === 'manage';

  const groups = useMemo<ConflictGroup[]>(() => {
    const byKey = new Map<string, ConflictGroup>();
    for (const cs of conflicts) {
      const unresolved = cs.files.filter((f) => !f.autoResolved);
      if (unresolved.length === 0) continue;
      const key = groupKey(cs.repoPath, cs.branch);
      const existing = byKey.get(key);
      if (existing) {
        existing.files.push(...unresolved);
      } else {
        byKey.set(key, { repoPath: cs.repoPath, branch: cs.branch, files: unresolved });
      }
    }
    return Array.from(byKey.values());
  }, [conflicts]);

  useEffect(() => {
    const { repoPath, branch } = route.params ?? {};
    if (repoPath && branch) {
      const group = groups.find((g) => g.repoPath === repoPath && g.branch === branch);
      const firstFile = group?.files[0];
      if (firstFile) {
        navigation.navigate('ConflictResolver', { repoPath, branch, filePath: firstFile.path });
      }
    }
  }, [route.params, groups, navigation]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of groups) {
      const key = groupKey(g.repoPath, g.branch);
      out.push({ type: 'header', key: `header:${key}`, group: g });
      for (const file of g.files) {
        out.push({ type: 'file', key: `file:${key}:${file.path}`, repoPath: g.repoPath, branch: g.branch, file });
      }
    }
    return out;
  }, [groups]);

  const handleFilePress = useCallback(
    (repoPath: string, branch: string, filePath: string) => {
      navigation.navigate('ConflictResolver', { repoPath, branch, filePath });
    },
    [navigation],
  );

  const handleManage = useCallback(() => {
    navigation.navigate('Conflicts', { mode: 'manage' });
  }, [navigation]);

  const handleAiFixRemaining = useCallback(async () => {
    if (onAiFixRemaining) {
      onAiFixRemaining();
      return;
    }

    const aiState = useAIStore.getState();
    const modelConfig = aiState.getSelectedModel();
    const providerConfig = aiState.providers.find((p) => p.id === modelConfig?.providerId);

    let fixed = 0;
    let attempted = 0;
    for (const group of groups) {
      for (const file of group.files) {
        if (file.format === 'binary') continue;
        if (file.baseContent === null || file.localContent === null || file.remoteContent === null) continue;
        attempted += 1;
        const proposal = await proposeMerge(file, modelConfig, providerConfig);
        if (proposal.mergedContent !== null && proposal.confidence === 'high') {
          useConflictStore.getState().updateConflict(group.repoPath, group.branch, (cs) =>
            ConflictResolverService.applyResolution(cs, file.path, { content: proposal.mergedContent }),
          );
          fixed += 1;
        }
      }
    }
    Alert.alert('AI conflict fixing', `AI fixed ${fixed} of ${attempted} conflicts`);
  }, [onAiFixRemaining, groups]);

  const renderHeader = useCallback(
    ({ group }: { group: ConflictGroup }) => {
      const key = groupKey(group.repoPath, group.branch);
      return (
        <View
          testID={`sync-conflicts.section.${key}`}
          className="px-4 pt-4 pb-2"
          style={{ backgroundColor: colors.surface ?? colors.background }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-[15px] font-bold" style={{ color: colors.text }} numberOfLines={1}>
                {repoName(group.repoPath)}
              </Text>
              <Text className="text-[13px] mt-0.5" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {group.branch}
              </Text>
            </View>
            <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: `${colors.error ?? '#ef4444'}20` }}>
              <Text className="text-[11px] font-bold" style={{ color: colors.error ?? '#ef4444' }}>
                {group.files.length} unresolved
              </Text>
            </View>
          </View>
          {group.files.length >= MANAGE_THRESHOLD && (
            <TouchableOpacity
              testID={`sync-conflicts.manage.${key}`}
              onPress={handleManage}
              className="mt-2 self-start px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: colors.primary ?? colors.text }}
            >
              <Text className="text-[12px] font-bold" style={{ color: '#ffffff' }}>
                Manage conflicts
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    },
    [colors, handleManage],
  );

  const renderFile = useCallback(
    ({ repoPath, branch, file }: { repoPath: string; branch: string; file: FileConflict }) => (
      <TouchableOpacity
        testID={`sync-conflicts.file.${groupKey(repoPath, branch)}.${file.path}`}
        onPress={() => handleFilePress(repoPath, branch, file.path)}
        className="flex-row items-center justify-between px-4 py-3.5 border-b"
        style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border }}
      >
        <View className="flex-1 mr-3">
          <Text className="text-[15px] font-medium" style={{ color: colors.text }} numberOfLines={1}>
            {file.path}
          </Text>
          <Text className="text-[13px] mt-0.5" style={{ color: colors.textSecondary }}>
            {kindLabel(file.kind)}
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
              {formatChip(file.format)}
            </Text>
          </View>
          {!file.autoResolved && (
            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.error ?? '#ef4444' }} />
          )}
        </View>
      </TouchableOpacity>
    ),
    [colors, handleFilePress],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.type === 'header' ? renderHeader({ group: item.group }) : renderFile(item),
    [renderHeader, renderFile],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title={isManageMode ? 'Manage Conflicts' : 'Sync Conflicts'}
        onBack={safeBack}
        actions={
          hasAiModel ? (
            <TouchableOpacity
              testID="sync-conflicts.ai-fix"
              onPress={handleAiFixRemaining}
              className="px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: `${colors.primary ?? colors.text}15` }}
            >
              <Text className="text-[12px] font-bold" style={{ color: colors.primary ?? colors.text }}>
                AI-fix remaining
              </Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-base" style={{ color: colors.textSecondary }}>
            No unresolved conflicts
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerClassName="pb-8"
        />
      )}
    </SafeAreaView>
  );
}

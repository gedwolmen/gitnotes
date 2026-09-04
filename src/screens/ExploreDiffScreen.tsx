import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText } from '@/components/ui/Button';
import { DiffLineList } from '@/components/explore/DiffLineList';
import { STATUS_META, resolveStatusTone } from '@/components/explore/exploreShared';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { DiffLine, FileDiff, HunkSelection } from '@/services/git/engine/GitEngine';
import { useRepoStore } from '@/stores/repoStore';
import type { RootStackParamList } from '@/navigation/types';
import { useTokens } from '@/contexts/ThemeContext';
import { GitFsService } from '@/services/git/GitFsService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ExploreDiff'>;

/** Full line-level diff of one working-tree file against HEAD.
 * Addition/deletion lines are multi-selectable; "Stage selected lines"
 * stages exactly those lines via the engine's `stageFileLines`. */
export default function ExploreDiffScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<Route>();
  const { colors } = useTokens();
  const { repoId, path } = route.params;
  const repo = useRepoStore((state) =>
    state.repositories.find((candidate) => candidate.id === repoId),
  );
  const localPath = repo ? GitFsService.workingTreeUri({ repoPath: repo.path }) : null;

  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [staging, setStaging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDiff = useCallback(async () => {
    if (!localPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await GitEngine.diffFile(localPath, path);
      setDiff(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [localPath, path]);

  useEffect(() => {
    void loadDiff();
  }, [loadDiff]);

  const toggleLine = useCallback((line: DiffLine) => {
    setNotice(null);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(line.index)) next.delete(line.index);
      else next.add(line.index);
      return next;
    });
  }, []);

  /**
   * Convert selected line indices to HunkSelection[].
   * Groups consecutive lines into hunks based on old/new line numbers.
   */
  function lineIndicesToHunkSelections(lines: DiffLine[], indices: Set<number>): HunkSelection[] {
    const selectedLines = lines.filter((l) => indices.has(l.index));
    if (selectedLines.length === 0) return [];

    // Sort by old line number
    const sorted = [...selectedLines].sort((a, b) => (a.oldLineno ?? 0) - (b.oldLineno ?? 0));

    const hunks: HunkSelection[] = [];
    let currentHunk: DiffLine[] = [];

    for (const line of sorted) {
      if (currentHunk.length === 0) {
        currentHunk.push(line);
      } else {
        const prev = currentHunk[currentHunk.length - 1];
        const gap = (line.oldLineno ?? 0) - (prev.oldLineno ?? 0);
        if (gap <= 1) {
          currentHunk.push(line);
        } else {
          // Finish current hunk
          const oldStart = currentHunk[0].oldLineno ?? 0;
          const newStart = currentHunk[0].newLineno ?? 0;
          hunks.push({
            oldStart,
            oldLines: currentHunk.filter((l) => l.origin?.startsWith('Deletion')).length,
            newStart,
            newLines: currentHunk.filter((l) => l.origin?.startsWith('Addition')).length,
          });
          currentHunk = [line];
        }
      }
    }

    // Don't forget the last hunk
    if (currentHunk.length > 0) {
      const oldStart = currentHunk[0].oldLineno ?? 0;
      const newStart = currentHunk[0].newLineno ?? 0;
      hunks.push({
        oldStart,
        oldLines: currentHunk.filter((l) => l.origin?.startsWith('Deletion')).length,
        newStart,
        newLines: currentHunk.filter((l) => l.origin?.startsWith('Addition')).length,
      });
    }

    return hunks;
  }

  const stageSelectedLines = useCallback(async () => {
    if (!localPath || selected.size === 0 || !diff) return;
    setStaging(true);
    setNotice(null);
    try {
      const hunks = lineIndicesToHunkSelections(diff.lines, selected);
      await GitEngine.stageFileLines(localPath, path, hunks);
      setSelected(new Set());
      setNotice(`${selected.size} line(s) staged.`);
      await loadDiff();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setStaging(false);
    }
  }, [localPath, path, selected, diff, loadDiff]);

  if (!repo) {
    return (
      <SafeAreaView className="flex-1" style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-8" style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary }}>Repository not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusKey = diff?.staged ? 'staged' : 'modified';
  const meta = STATUS_META[statusKey as keyof typeof STATUS_META];

  return (
    <SafeAreaView className="flex-1" style={{ flex: 1, backgroundColor: colors.background }} testID="explore-diff.root">
      <View
        className="flex-row items-center gap-2 px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="explore-diff.back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Heading className="text-lg" style={{ color: colors.text }} numberOfLines={1}>
            {path}
          </Heading>
          <Text className="text-xs font-mono" style={{ color: colors.textSecondary }} numberOfLines={1}>
            {diff ? `+${diff.added} −${diff.deleted} vs HEAD` : 'working tree diff'}
          </Text>
        </View>
        {meta && (
          <View
            className="rounded px-2 py-0.5"
            style={{ backgroundColor: resolveStatusTone(colors, meta.tone).bg }}
          >
            <Text className="text-[10px] font-semibold" style={{ color: resolveStatusTone(colors, meta.tone).fg }}>
              {meta.label}
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center gap-2" style={{ flex: 1 }}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={{ color: colors.textSecondary }}>Computing diff…</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8" style={{ flex: 1 }}>
          <Ionicons name="warning-outline" size={40} color={colors.error} />
          <Text className="mt-2 text-center text-sm" style={{ color: colors.error }}>{error}</Text>
        </View>
      ) : diff?.isBinary ? (
        <View className="flex-1 items-center justify-center px-8" style={{ flex: 1 }}>
          <Ionicons name="cube-outline" size={44} color={colors.textSecondary} />
          <Text className="mt-2 text-center" style={{ color: colors.textSecondary }}>
            Binary file — no textual diff available.
          </Text>
        </View>
      ) : diff ? (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
          {diff.lines.length === 0 ? (
            <Text className="text-center" style={{ color: colors.textSecondary }}>No textual changes.</Text>
          ) : (
            <DiffLineList
              lines={diff.lines}
              showLineNumbers
              selectedIndices={selected}
              onToggleLine={toggleLine}
            />
          )}
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center" style={{ flex: 1 }}>
          <Button variant="outline" size="sm" onPress={() => navigation.goBack()}>
            <ButtonText>Go back</ButtonText>
          </Button>
        </View>
      )}

      {diff && !diff.isBinary && diff.lines.length > 0 && (
        <View className="px-4 pb-3 pt-2" style={{ borderTopWidth: 1, borderTopColor: colors.border }} testID="explore-diff.stage-bar">
          {notice && (
            <Text className="mb-1.5 text-center" style={{ color: colors.success }} testID="explore-diff.notice">
              {notice}
            </Text>
          )}
          <Text className="mb-1.5 text-center text-[11px]" style={{ color: colors.textSecondary }}>
            Tap +/− lines to select them for partial staging.
          </Text>
          <View className="flex-row gap-2">
            {selected.size > 0 && (
              <Button variant="secondary" size="sm" className="flex-1" onPress={() => setSelected(new Set())}>
                <ButtonText>Clear</ButtonText>
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              disabled={selected.size === 0 || staging}
              onPress={() => void stageSelectedLines()}
              testID="explore-diff.stage-selected"
            >
              {staging ? <ActivityIndicator size="small" color="#ffffff" /> : null}
              <ButtonText>Stage selected</ButtonText>
            </Button>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

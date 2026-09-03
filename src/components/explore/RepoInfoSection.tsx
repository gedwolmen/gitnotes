import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/Button';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { PushIntegrateResult, RepoInfo, RepairReport } from '@/services/git/engine/GitEngine';
import { RepoService } from '@/services/repos/RepoService';
import { GitFsService } from '@/services/git/GitFsService';
import { useRepoStore } from '@/stores/repoStore';
import { relativeTime, type SectionProps } from './exploreShared';
import type { RootStackParamList } from '@/navigation/types';
import { useTokens } from '@/contexts/ThemeContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function InfoRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const { colors } = useTokens();
  return (
    <View className="flex-row items-start justify-between py-1.5" testID={testID}>
      <Text className="w-28 text-xs font-semibold" style={{ color: colors.textSecondary }}>{label}</Text>
      <Text className="min-w-0 flex-1 text-right text-xs" style={{ color: colors.text }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function describeSync(result: PushIntegrateResult, aheadBefore: number): string {
  if (result.kind === 'Direct' && aheadBefore === 0) return 'Already up to date.';
  return result.message;
}

function describeRepair(report: RepairReport): string {
  if (report.isHealthy && report.repaired.length === 0) {
    return 'Repository is healthy — nothing needed repair.';
  }
  const parts: string[] = [];
  if (report.repaired.length > 0) parts.push(`Repaired: ${report.repaired.join('; ')}`);
  if (report.unrecoverable.length > 0) parts.push(`Unrecoverable: ${report.unrecoverable.join('; ')}`);
  return `${report.isHealthy ? 'Healthy after repair.' : 'NOT healthy.'} ${parts.join(' ')}`.trim();
}

/** Repo Info section (todo 25): metadata + Sync now (push-with-integrate),
 * Repair repo, and Remove repo. */
export function RepoInfoSection({ repo, status, active, onChanged, chromeTopInset = 0 }: SectionProps) {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTokens();
  const [info, setInfo] = useState<RepoInfo | null>(null);
  const [busy, setBusy] = useState<'sync' | 'repair' | 'remove' | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [repairResult, setRepairResult] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(repo.lastSyncedAt ?? null);
  const [version, setVersion] = useState(0);
  const [notCloned, setNotCloned] = useState(false);
  const refreshStore = useRepoStore((state) => state.refreshRepos);
  const removeRepo = useRepoStore((state) => state.removeRepository);

  useEffect(() => {
    setLastSync(repo.lastSyncedAt ?? null);
  }, [repo.lastSyncedAt]);

  const load = useCallback(async () => {
    try {
      const cloned = await GitFsService.isCloned({ repoPath: repo.path });
      if (!cloned) {
        setNotCloned(true);
        return;
      }
      setInfo(await GitEngine.repoInfo(repo.localPath));
    } catch {
      // header status already surfaces repo health; info panel stays empty
    }
  }, [repo.localPath, repo.path]);

  useEffect(() => {
    if (active) void load();
  }, [active, load, version]);

  const syncNow = useCallback(async () => {
    if (busy) return;
    setBusy('sync');
    setSyncResult(null);
    setSyncFailed(false);
    const aheadBefore = status?.ahead ?? 0;
    try {
      const result = await GitEngine.pushWithIntegrate(repo.localPath, 'origin', repo.id);
      if (result.kind === 'Conflicts') {
        const paths = result.conflicts.join(', ');
        setSyncFailed(true);
        setSyncResult(`Integration stopped on conflicts (${paths}). Resolve them in the Conflicts section.`);
      } else {
        setSyncResult(describeSync(result, aheadBefore));
      }
      await RepoService.refreshLastSynced(repo.id);
      await refreshStore();
      setLastSync(Date.now());
      onChanged();
      setVersion((value) => value + 1);
    } catch (caught) {
      setSyncFailed(true);
      setSyncResult(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }, [busy, status, repo, refreshStore, onChanged]);

  const repair = useCallback(async () => {
    if (busy) return;
    setBusy('repair');
    setRepairResult(null);
    try {
      const report = await GitEngine.repairRepo(repo.localPath);
      setRepairResult(describeRepair(report));
      onChanged();
      setVersion((value) => value + 1);
    } catch (caught) {
      setRepairResult(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }, [busy, repo.localPath, onChanged]);

  const removeNow = useCallback(async () => {
    setBusy('remove');
    try {
      await removeRepo(repo.id);
      navigation.goBack();
    } catch (caught) {
      Alert.alert('Could not remove repo', caught instanceof Error ? caught.message : String(caught));
      setBusy(null);
    }
  }, [removeRepo, repo.id, navigation]);

  const confirmRemove = useCallback(() => {
    Alert.alert(
      'Remove repository',
      `Remove "${repo.name}" from GitNotes? The local clone is deleted from this device. The remote repository is untouched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () =>
            Alert.alert(
              'Final confirmation',
              'Uncommitted working-tree changes and unpushed local commits will be lost. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove repo',
                  style: 'destructive',
                  onPress: () => void removeNow(),
                },
              ],
            ),
        },
      ],
    );
  }, [repo.name, removeNow]);

  if (notCloned) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons name="folder-outline" size={36} color={colors.textSecondary} />
        <Text className="mt-2 text-center text-sm font-semibold" style={{ color: colors.text }}>Clone required</Text>
        <Text className="mt-1 text-center text-xs" style={{ color: colors.textSecondary }}>
          This repository has not been cloned to this device yet.
        </Text>
      </View>
    );
  }

  return (
    <View className="px-4" style={{ paddingTop: chromeTopInset }} testID="explore.info.root">
      <View className="rounded-sm p-3" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}>
        <View className="flex-row items-center gap-2 pb-2" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
          <Text className="text-sm font-bold" style={{ color: colors.text }}>Repository</Text>
          <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: `${colors.accent}26` }}>
            <Text className="text-[10px] font-semibold" style={{ color: colors.accent }}>{repo.provider}</Text>
          </View>
        </View>
        <View className="mt-1">
          <InfoRow label="Name" value={repo.name} />
          <InfoRow label="Remote URL" value={repo.remoteUrl ?? '(none)'} testID="explore.info.remote" />
          <InfoRow
            label="Branch"
            value={status?.currentBranch ?? info?.currentBranch ?? '(detached)'}
            testID="explore.info.branch"
          />
          <InfoRow
            label="Ahead / behind"
            value={status ? `${status.ahead} / ${status.behind}` : '—'}
            testID="explore.info.aheadbehind"
          />
          <InfoRow label="Commits" value={info ? String(info.totalCommits) : '—'} testID="explore.info.commits" />
          <InfoRow label="Working tree" value={info ? (info.isClean ? 'clean' : 'dirty') : '—'} />
          <InfoRow label="Last synced" value={relativeTime(lastSync)} testID="explore.info.lastsync" />
          <InfoRow label="Local path" value={repo.localPath} />
        </View>
      </View>

      <Button
        className="mt-3"
        onPress={() => void syncNow()}
        disabled={busy !== null}
        testID="explore.info.sync"
      >
        {busy === 'sync' ? <ActivityIndicator size="small" color={colors.text} /> : null}
        <ButtonText>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</ButtonText>
      </Button>
      {syncResult && (
        <Text
          className="mt-2 text-xs"
          style={{ color: syncFailed ? colors.error : colors.text }}
          testID="explore.info.sync-result"
        >
          {syncResult}
        </Text>
      )}
      <Text className="mt-2 text-center text-[11px]" style={{ color: colors.textSecondary }}>
        Sync pushes the current branch (integrating remote changes when needed). It never force-pushes.
      </Text>

      <Button
        className="mt-3"
        variant="outline"
        onPress={() => void repair()}
        disabled={busy !== null}
        testID="explore.info.repair"
      >
        {busy === 'repair' ? <ActivityIndicator size="small" color={colors.text} /> : null}
        <ButtonText>Repair repo</ButtonText>
      </Button>
      {repairResult && (
        <Text className="mt-2 text-xs" style={{ color: colors.textSecondary }} testID="explore.info.repair-result">
          {repairResult}
        </Text>
      )}

      <Button
        className="mt-3"
        variant="outline"
        onPress={confirmRemove}
        disabled={busy !== null}
        testID="explore.info.remove"
      >
        {busy === 'remove' ? <ActivityIndicator size="small" color={colors.error} /> : null}
        <ButtonText style={{ color: colors.error }}>Remove repo…</ButtonText>
      </Button>
      <Text className="mt-2 pb-24 text-center text-[11px]" style={{ color: colors.textSecondary }}>
        Repair rebuilds a damaged index and prunes corrupt objects. Remove deletes the local clone after two confirmations.
      </Text>
    </View>
  );
}

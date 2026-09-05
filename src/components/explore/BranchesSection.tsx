import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, ButtonText } from '@/components/ui/Button';
import { Input, InputField } from '@/components/ui/Input';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { BranchInfo } from '@/services/git/engine/GitEngine';
import { GitFsService } from '@/services/git/GitFsService';
import type { SectionProps } from './exploreShared';
import { useTokens } from '@/contexts/ThemeContext';

type BranchRow =
  | { kind: 'header'; key: string; title: string; count: number }
  | { kind: 'branch'; key: string; branch: BranchInfo };

export function BranchesSection({ repo, active, onChanged, chromeTopInset = 0 }: SectionProps) {
  const { colors } = useTokens();
  const [branches, setBranches] = useState<BranchInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [version, setVersion] = useState(0);
  const [notCloned, setNotCloned] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotCloned(false);
    try {
      const cloned = await GitFsService.isCloned({ repoPath: repo.path });
      if (!cloned) {
        setNotCloned(true);
        setLoading(false);
        return;
      }
      setBranches(await GitEngine.listBranches(repo.localPath));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [repo.localPath, repo.path]);

  useEffect(() => {
    if (active) void load();
  }, [active, load, version]);

  const rows = useMemo<BranchRow[]>(() => {
    if (!branches) return [];
    const byName = (a: BranchInfo, b: BranchInfo) => a.name.localeCompare(b.name);
    const local = branches.filter((branch) => !branch.isRemote).sort(byName);
    const remote = branches.filter((branch) => branch.isRemote).sort(byName);
    const out: BranchRow[] = [];
    if (local.length > 0) {
      out.push({ kind: 'header', key: 'header:local', title: 'Local', count: local.length });
      for (const branch of local) out.push({ kind: 'branch', key: `local:${branch.name}`, branch });
    }
    if (remote.length > 0) {
      out.push({ kind: 'header', key: 'header:remote', title: 'Remote', count: remote.length });
      for (const branch of remote) out.push({ kind: 'branch', key: `remote:${branch.name}`, branch });
    }
    return out;
  }, [branches]);

  const create = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy('create');
    try {
      await GitEngine.createBranch(repo.localPath, name);
      setNewName('');
      onChanged();
      setVersion((value) => value + 1);
    } catch (caught) {
      Alert.alert('Could not create branch', caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }, [newName, repo.localPath, onChanged]);

  const checkout = useCallback(
    async (name: string) => {
      setBusy(`checkout:${name}`);
      try {
        await GitEngine.checkoutBranch(repo.localPath, name);
        onChanged();
        setVersion((value) => value + 1);
      } catch (caught) {
        Alert.alert('Could not checkout', caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(null);
      }
    },
    [repo.localPath, onChanged],
  );

  const remove = useCallback(
    (name: string) => {
      Alert.alert('Delete branch', `Delete branch "${name}"? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(`delete:${name}`);
            try {
              await GitEngine.deleteBranch(repo.localPath, name);
              onChanged();
              setVersion((value) => value + 1);
            } catch (caught) {
              Alert.alert('Could not delete', caught instanceof Error ? caught.message : String(caught));
            } finally {
              setBusy(null);
            }
          },
        },
      ]);
    },
    [repo.localPath, onChanged],
  );

  const saveRename = useCallback(
    async (name: string) => {
      const target = renameValue.trim();
      if (!target || target === name) {
        setRenaming(null);
        return;
      }
      setBusy(`rename:${name}`);
      try {
        await GitEngine.renameBranch(repo.localPath, name, target);
        setRenaming(null);
        setRenameValue('');
        onChanged();
        setVersion((value) => value + 1);
      } catch (caught) {
        Alert.alert('Could not rename', caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(null);
      }
    },
    [renameValue, repo.localPath, onChanged],
  );

  const renderBranch = useCallback(
    (item: BranchInfo) => {
      if (renaming === item.name && !item.isRemote) {
        return (
          <View className="mx-4 mb-2 rounded-sm px-3 py-2.5" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }} testID={`explore.branch.rename.${item.name}`}>
            <Text className="text-[11px]" style={{ color: colors.textSecondary }}>Rename "{item.name}"</Text>
            <View className="mt-1.5 flex-row items-center gap-2">
              <View className="flex-1">
                <Input>
                  <InputField
                    value={renameValue}
                    onChangeText={setRenameValue}
                    placeholder="new-name"
                    autoCapitalize="none"
                    autoCorrect={false}
                    testID={`explore.branch.rename.input.${item.name}`}
                  />
                </Input>
              </View>
              <Button size="sm" disabled={busy !== null || !renameValue.trim()} onPress={() => void saveRename(item.name)}>
                Save
              </Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onPress={() => setRenaming(null)}>
                <ButtonText>Cancel</ButtonText>
              </Button>
            </View>
          </View>
        );
      }
      return (
        <View className="mx-4 mb-2 rounded-sm px-3 py-2.5" style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}>
          <View className="flex-row items-center gap-2">
            <Ionicons name="git-branch-outline" size={14} color={item.isRemote ? colors.textSecondary : colors.accent} />
            <Text className="min-w-0 flex-1 text-sm font-semibold" numberOfLines={1} style={{ color: colors.text }}>
              {item.name}
            </Text>
            {item.isCurrent && (
              <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: `${colors.success}26` }}>
                <Text className="text-[10px] font-semibold" style={{ color: colors.success }} testID={`explore.branch.current.${item.name}`}>
                  current
                </Text>
              </View>
            )}
            {item.isRemote && (
              <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: colors.surfaceSecondary }}>
                <Text className="text-[10px] font-semibold" style={{ color: colors.textSecondary }}>remote</Text>
              </View>
            )}
          </View>
          <View className="mt-1.5 flex-row items-center justify-between">
            <Text className="text-[11px]" style={{ color: colors.textSecondary }}>
              {item.upstream ? `upstream ${item.upstream} · ` : ''}
              {`ahead ${item.ahead} · behind ${item.behind}`}
            </Text>
            {!item.isRemote && !item.isCurrent && (
              <View className="flex-row gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onPress={() => void checkout(item.name)}
                  testID={`explore.branch.checkout.${item.name}`}
                >
                  <ButtonText>Checkout</ButtonText>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onPress={() => {
                    setRenaming(item.name);
                    setRenameValue('');
                  }}
                  testID={`explore.branch.rename-button.${item.name}`}
                >
                  <ButtonText>Rename</ButtonText>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onPress={() => remove(item.name)}
                  testID={`explore.branch.delete.${item.name}`}
                >
                  <ButtonText>Delete</ButtonText>
                </Button>
              </View>
            )}
            {!item.isRemote && item.isCurrent && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onPress={() => {
                  setRenaming(item.name);
                  setRenameValue('');
                }}
                testID={`explore.branch.rename-button.${item.name}`}
              >
                <ButtonText>Rename</ButtonText>
              </Button>
            )}
          </View>
        </View>
      );
    },
    [busy, checkout, remove, renaming, renameValue, saveRename],
  );

  const renderItem = useCallback(
    ({ item }: { item: BranchRow }) =>
      item.kind === 'header' ? (
        <View className="flex-row items-center justify-between px-4 pb-1 pt-3">
          <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{item.title}</Text>
          <Text className="text-[11px]" style={{ color: colors.textSecondary }}>{item.count}</Text>
        </View>
      ) : (
        renderBranch(item.branch)
      ),
    [renderBranch],
  );

  if (error) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons name="warning-outline" size={36} color={colors.error} />
        <Text className="mt-2 text-center text-sm" style={{ color: colors.error }}>{error}</Text>
        <Button variant="outline" size="sm" className="mt-3" onPress={() => void load()}>
          <ButtonText>Retry</ButtonText>
        </Button>
      </View>
    );
  }

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
    <FlatList className="flex-1"
      data={rows}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
       contentContainerStyle={{ paddingTop: chromeTopInset, paddingBottom: 96, flexGrow: 1 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View className="px-4 pb-1">
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Input>
                <InputField
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="new-branch-name"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="explore.branch.input"
                />
              </Input>
            </View>
            <Button size="sm" disabled={busy !== null || !newName.trim()} onPress={() => void create()}>
              {busy === 'create' ? <ActivityIndicator size="small" color={colors.text} /> : null}
              <ButtonText>Create</ButtonText>
            </Button>
          </View>
          <Text className="mt-2 text-xs" style={{ color: colors.textSecondary }} testID="explore.branches.count">
            {branches ? `${branches.length} branch(es)` : 'Reading branches…'}
          </Text>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View className="flex-1 items-center justify-center" style={{ minHeight: 240 }}>
            <Ionicons name="git-branch-outline" size={40} color={colors.textSecondary} />
            <Text className="mt-2 text-center text-sm" style={{ color: colors.textSecondary }}>No branches.</Text>
          </View>
        ) : undefined
      }
      testID="explore.branches.list"
    />
  );
}

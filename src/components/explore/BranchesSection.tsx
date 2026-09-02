import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, ButtonText } from '@/components/ui/Button';
import { Input, InputField } from '@/components/ui/Input';
import * as GitEngine from '@/services/git/engine/GitEngine';
import type { BranchInfo } from '@/services/git/engine/GitEngine';
import type { SectionProps } from './exploreShared';

type BranchRow =
  | { kind: 'header'; key: string; title: string; count: number }
  | { kind: 'branch'; key: string; branch: BranchInfo };

export function BranchesSection({ repo, active, onChanged }: SectionProps) {
  const [branches, setBranches] = useState<BranchInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBranches(await GitEngine.listBranches(repo.path));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [repo.path]);

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
      await GitEngine.createBranch(repo.path, name);
      setNewName('');
      onChanged();
      setVersion((value) => value + 1);
    } catch (caught) {
      Alert.alert('Could not create branch', caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }, [newName, repo.path, onChanged]);

  const checkout = useCallback(
    async (name: string) => {
      setBusy(`checkout:${name}`);
      try {
        await GitEngine.checkoutBranch(repo.path, name);
        onChanged();
        setVersion((value) => value + 1);
      } catch (caught) {
        Alert.alert('Could not checkout', caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(null);
      }
    },
    [repo.path, onChanged],
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
              await GitEngine.deleteBranch(repo.path, name);
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
    [repo.path, onChanged],
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
        await GitEngine.renameBranch(repo.path, name, target);
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
    [renameValue, repo.path, onChanged],
  );

  const renderBranch = useCallback(
    (item: BranchInfo) => {
      if (renaming === item.name && !item.isRemote) {
        return (
          <View className="mx-4 mb-2 rounded-lg border border-indigo-300 bg-white px-3 py-2.5" testID={`explore.branch.rename.${item.name}`}>
            <Text className="text-[11px] text-gray-500">Rename "{item.name}"</Text>
            <View className="mt-1.5 flex-row items-center gap-2">
              <View className="flex-1">
                <Input className="border-gray-300">
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
                <ButtonText>Save</ButtonText>
              </Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onPress={() => setRenaming(null)}>
                <ButtonText>Cancel</ButtonText>
              </Button>
            </View>
          </View>
        );
      }
      return (
        <View className="mx-4 mb-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
          <View className="flex-row items-center gap-2">
            <Ionicons name="git-branch-outline" size={14} color={item.isRemote ? '#6b7280' : '#4f46e5'} />
            <Text className="min-w-0 flex-1 text-sm font-semibold text-black" numberOfLines={1}>
              {item.name}
            </Text>
            {item.isCurrent && (
              <View className="rounded bg-emerald-100 px-1.5 py-0.5">
                <Text className="text-[10px] font-semibold text-emerald-700" testID={`explore.branch.current.${item.name}`}>
                  current
                </Text>
              </View>
            )}
            {item.isRemote && (
              <View className="rounded bg-gray-100 px-1.5 py-0.5">
                <Text className="text-[10px] font-semibold text-gray-600">remote</Text>
              </View>
            )}
          </View>
          <View className="mt-1.5 flex-row items-center justify-between">
            <Text className="text-[11px] text-gray-500">
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
          <Text className="text-xs font-bold uppercase tracking-wide text-gray-400">{item.title}</Text>
          <Text className="text-[11px] text-gray-400">{item.count}</Text>
        </View>
      ) : (
        renderBranch(item.branch)
      ),
    [renderBranch],
  );

  if (error) {
    return (
      <View className="items-center px-8 py-10">
        <Ionicons name="warning-outline" size={36} color="#dc2626" />
        <Text className="mt-2 text-center text-sm text-red-600">{error}</Text>
        <Button variant="outline" size="sm" className="mt-3" onPress={() => void load()}>
          <ButtonText>Retry</ButtonText>
        </Button>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      contentContainerStyle={{ paddingTop: 10, paddingBottom: 96 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#7b8cde" />
      }
      ListHeaderComponent={
        <View className="px-4 pb-1">
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Input className="border-gray-300">
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
              {busy === 'create' ? <ActivityIndicator size="small" color="#ffffff" /> : null}
              <ButtonText>Create</ButtonText>
            </Button>
          </View>
          <Text className="mt-2 text-xs text-gray-500" testID="explore.branches.count">
            {branches ? `${branches.length} branch(es)` : 'Reading branches…'}
          </Text>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <Text className="mt-8 text-center text-gray-500">No branches.</Text>
        ) : undefined
      }
      testID="explore.branches.list"
    />
  );
}

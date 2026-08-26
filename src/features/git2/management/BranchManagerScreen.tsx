/**
 * BranchManagerScreen — list, create, rename, delete, and checkout branches.
 *
 * All operations go through Git2Client (native git2-rs).
 * Current branch is protected from deletion.
 * All destructive actions show confirmation dialogs.
 *
 * GPL-3.0 derivative of GitSync.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useBranchStore } from './branchStore';
import { useRepoStore } from '../repositories/repoStore';

export function BranchManagerScreen() {
  const [newBranchName, setNewBranchName] = useState('');
  const [renameOldName, setRenameOldName] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  const [showRenameForm, setShowRenameForm] = useState(false);

  const repo = useRepoStore((s) => s.getActiveRepo());
  const {
    branches,
    currentBranch,
    loading,
    error,
    operationLock,
    listBranches,
    createBranch,
    checkoutBranch,
    deleteBranch,
    renameBranch,
    clearError,
  } = useBranchStore();

  useEffect(() => {
    if (repo) {
      listBranches(repo.localPath);
    }
  }, [repo?.localPath]);

  useEffect(() => {
    if (error) {
      Alert.alert('Branch Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error]);

  function handleCreateBranch() {
    if (!newBranchName.trim()) return;
    if (!repo) return;
    Alert.alert(
      'Create Branch',
      `Create new branch "${newBranchName.trim()}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            await createBranch(repo.localPath, newBranchName.trim());
            setNewBranchName('');
          },
        },
      ],
    );
  }

  function handleCheckout(branchName: string) {
    if (!repo) return;
    Alert.alert(
      'Checkout Branch',
      `Switch to branch "${branchName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Checkout',
          onPress: async () => {
            await checkoutBranch(repo.localPath, branchName);
          },
        },
      ],
    );
  }

  function handleDelete(branchName: string) {
    if (!repo) return;
    if (branchName === currentBranch) {
      Alert.alert('Cannot Delete', 'You cannot delete the current branch.');
      return;
    }
    Alert.alert(
      'Delete Branch',
      `Are you sure you want to delete "${branchName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteBranch(repo.localPath, branchName);
          },
        },
      ],
    );
  }

  function handleRename() {
    if (!repo) return;
    if (!renameOldName.trim() || !renameNewName.trim()) return;
    Alert.alert(
      'Rename Branch',
      `Rename "${renameOldName.trim()}" to "${renameNewName.trim()}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: async () => {
            await renameBranch(repo.localPath, renameOldName.trim(), renameNewName.trim());
            setRenameOldName('');
            setRenameNewName('');
            setShowRenameForm(false);
          },
        },
      ],
    );
  }

  const localBranches = branches.filter((b) => !b.isRemote);

  if (!repo) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>No active repository</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Branches</Text>
      <Text style={styles.currentBranch}>Current: {currentBranch ?? 'unknown'}</Text>

      {operationLock && (
        <View style={styles.lockBanner}>
          <ActivityIndicator size="small" color="#5b7ef4" />
          <Text style={styles.lockText}>Operation in progress...</Text>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={newBranchName}
          onChangeText={setNewBranchName}
          placeholder="New branch name"
          autoCapitalize="none"
        />
        <Button
          title="Create"
          onPress={handleCreateBranch}
          disabled={!newBranchName.trim() || operationLock}
        />
      </View>

      <Button
        title={showRenameForm ? 'Hide Rename' : 'Rename Branch'}
        onPress={() => setShowRenameForm(!showRenameForm)}
      />

      {showRenameForm && (
        <View style={styles.renameForm}>
          <TextInput
            style={styles.input}
            value={renameOldName}
            onChangeText={setRenameOldName}
            placeholder="Current branch name"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={renameNewName}
            onChangeText={setRenameNewName}
            placeholder="New branch name"
            autoCapitalize="none"
          />
          <Button
            title="Rename"
            onPress={handleRename}
            disabled={!renameOldName.trim() || !renameNewName.trim() || operationLock}
          />
        </View>
      )}

      {loading && !operationLock ? (
        <ActivityIndicator size="large" color="#5b7ef4" style={styles.loader} />
      ) : (
        <FlatList
          data={localBranches}
          keyExtractor={(item) => item.name}
          style={styles.list}
          renderItem={({ item }) => (
            <View style={styles.branchRow}>
              <View style={styles.branchInfo}>
                <Text style={[styles.branchName, item.isCurrent && styles.currentBranchName]}>
                  {item.name}
                  {item.isCurrent && ' (current)'}
                </Text>
                <Text style={styles.oid}>{item.oid?.slice(0, 7) ?? 'unknown'}</Text>
              </View>
              <View style={styles.branchActions}>
                {!item.isCurrent && (
                  <Button title="Checkout" onPress={() => handleCheckout(item.name)} />
                )}
                {!item.isCurrent && (
                  <Button
                    title="Delete"
                    onPress={() => handleDelete(item.name)}
                    color="#c00"
                  />
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No branches found</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  currentBranch: { fontSize: 14, color: '#666', marginBottom: 16 },
  error: { fontSize: 16, color: '#c00', textAlign: 'center', marginTop: 40 },
  lockBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f4ff', padding: 8, borderRadius: 4, marginBottom: 12 },
  lockText: { marginLeft: 8, color: '#5b7ef4' },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginRight: 8 },
  renameForm: { marginTop: 12, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 8 },
  loader: { marginTop: 40 },
  list: { flex: 1, marginTop: 16 },
  branchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  branchInfo: { flex: 1 },
  branchName: { fontSize: 16, fontWeight: '500' },
  currentBranchName: { color: '#5b7ef4' },
  oid: { fontSize: 12, color: '#999', marginTop: 2 },
  branchActions: { flexDirection: 'row', gap: 8 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
});

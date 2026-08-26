/**
 * RemoteManagerScreen — list, add, rename, remove Git remotes.
 *
 * All operations go through Git2Client (native git2-rs).
 * "origin" is protected from removal as the default remote.
 * setUrl and rename use add+remove workaround since Git2Client lacks those ops.
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
import { useRemoteStore } from './remoteStore';
import { useRepoStore } from '../repositories/repoStore';

export function RemoteManagerScreen() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRenameForm, setShowRenameForm] = useState(false);
  const [remoteName, setRemoteName] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [renameOldName, setRenameOldName] = useState('');
  const [renameNewName, setRenameNewName] = useState('');

  const repo = useRepoStore((s) => s.getActiveRepo());
  const {
    remotes,
    loading,
    error,
    operationLock,
    listRemotes,
    addRemote,
    removeRemote,
    setUrl,
    renameRemote,
    clearError,
  } = useRemoteStore();

  useEffect(() => {
    if (repo) {
      listRemotes(repo.localPath);
    }
  }, [repo?.localPath]);

  useEffect(() => {
    if (error) {
      Alert.alert('Remote Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error]);

  function handleAddRemote() {
    if (!remoteName.trim() || !remoteUrl.trim()) return;
    if (!repo) return;
    Alert.alert(
      'Add Remote',
      `Add remote "${remoteName.trim()}" pointing to "${remoteUrl.trim()}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: async () => {
            await addRemote(repo.localPath, remoteName.trim(), remoteUrl.trim());
            setRemoteName('');
            setRemoteUrl('');
            setShowAddForm(false);
          },
        },
      ],
    );
  }

  function handleRemove(remoteNameToRemove: string) {
    if (!repo) return;
    if (remoteNameToRemove === 'origin') {
      Alert.alert('Cannot Remove', 'The default remote "origin" cannot be removed.');
      return;
    }
    Alert.alert(
      'Remove Remote',
      `Are you sure you want to remove remote "${remoteNameToRemove}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeRemote(repo.localPath, remoteNameToRemove);
          },
        },
      ],
    );
  }

  function handleSetUrl() {
    if (!repo) return;
    if (!remoteName.trim() || !remoteUrl.trim()) return;
    Alert.alert(
      'Set Remote URL',
      `Update URL for "${remoteName.trim()}" to "${remoteUrl.trim()}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            await setUrl(repo.localPath, remoteName.trim(), remoteUrl.trim());
            setRemoteName('');
            setRemoteUrl('');
            setShowAddForm(false);
          },
        },
      ],
    );
  }

  function handleRename() {
    if (!repo) return;
    if (!renameOldName.trim() || !renameNewName.trim()) return;
    Alert.alert(
      'Rename Remote',
      `Rename remote "${renameOldName.trim()}" to "${renameNewName.trim()}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: async () => {
            await renameRemote(repo.localPath, renameOldName.trim(), renameNewName.trim());
            setRenameOldName('');
            setRenameNewName('');
            setShowRenameForm(false);
          },
        },
      ],
    );
  }

  if (!repo) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>No active repository</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Remotes</Text>

      {operationLock && (
        <View style={styles.lockBanner}>
          <ActivityIndicator size="small" color="#5b7ef4" />
          <Text style={styles.lockText}>Operation in progress...</Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <Button
          title={showAddForm ? 'Hide Add' : '+ Add Remote'}
          onPress={() => {
            setShowAddForm(!showAddForm);
            setShowRenameForm(false);
          }}
        />
        <Button
          title={showRenameForm ? 'Hide Rename' : 'Rename Remote'}
          onPress={() => {
            setShowRenameForm(!showRenameForm);
            setShowAddForm(false);
          }}
        />
      </View>

      {showAddForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Add / Set URL Remote</Text>
          <TextInput
            style={styles.input}
            value={remoteName}
            onChangeText={setRemoteName}
            placeholder="remote-name (e.g. origin)"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={remoteUrl}
            onChangeText={setRemoteUrl}
            placeholder="https://github.com/user/repo.git"
            autoCapitalize="none"
            keyboardType="url"
          />
          <View style={styles.formButtons}>
            <Button title="Add Remote" onPress={handleAddRemote} disabled={!remoteName.trim() || !remoteUrl.trim() || operationLock} />
            <Button title="Set URL" onPress={handleSetUrl} disabled={!remoteName.trim() || !remoteUrl.trim() || operationLock} />
          </View>
        </View>
      )}

      {showRenameForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Rename Remote</Text>
          <TextInput
            style={styles.input}
            value={renameOldName}
            onChangeText={setRenameOldName}
            placeholder="current-remote-name"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={renameNewName}
            onChangeText={setRenameNewName}
            placeholder="new-remote-name"
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
          data={remotes}
          keyExtractor={(item) => item.name}
          style={styles.list}
          renderItem={({ item }) => (
            <View style={styles.remoteRow}>
              <View style={styles.remoteInfo}>
                <Text style={styles.remoteName}>
                  {item.name}
                  {item.name === 'origin' && ' (default)'}
                </Text>
                <Text style={styles.remoteUrl} numberOfLines={1}>
                  {item.url || '(url unknown — needs refetch)'}
                </Text>
              </View>
              {item.name !== 'origin' && (
                <View style={styles.remoteActions}>
                  <Button
                    title="Remove"
                    color="#c00"
                    onPress={() => handleRemove(item.name)}
                  />
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No remotes configured</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  error: { fontSize: 16, color: '#c00', textAlign: 'center', marginTop: 40 },
  lockBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f4ff', padding: 8, borderRadius: 4, marginBottom: 12 },
  lockText: { marginLeft: 8, color: '#5b7ef4' },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  form: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 12 },
  formTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 14 },
  formButtons: { flexDirection: 'row', gap: 8 },
  loader: { marginTop: 40 },
  list: { flex: 1 },
  remoteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  remoteInfo: { flex: 1 },
  remoteName: { fontSize: 16, fontWeight: '500' },
  remoteUrl: { fontSize: 12, color: '#999', marginTop: 2 },
  remoteActions: { flexDirection: 'row', gap: 8 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
});
/**
 * TagManagerScreen — list, create, and delete Git tags.
 *
 * All operations go through Git2Client (native git2-rs).
 * Note: Tag operations are not yet implemented in Git2Client.
 * UI shows informative message when tags are unavailable.
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
import { useTagStore, TAG_OPERATIONS_AVAILABLE } from './tagStore';
import { useRepoStore } from '../repositories/repoStore';

export function TagManagerScreen() {
  const [newTagName, setNewTagName] = useState('');
  const [commitOid, setCommitOid] = useState('');

  const repo = useRepoStore((s) => s.getActiveRepo());
  const {
    tags,
    loading,
    error,
    operationLock,
    listTags,
    createTag,
    deleteTag,
    clearError,
  } = useTagStore();

  useEffect(() => {
    if (repo && TAG_OPERATIONS_AVAILABLE) {
      listTags(repo.localPath);
    }
  }, [repo?.localPath]);

  useEffect(() => {
    if (error) {
      Alert.alert('Tag Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error]);

  function handleCreateTag() {
    if (!newTagName.trim()) return;
    if (!repo) return;
    Alert.alert(
      'Create Tag',
      `Create tag "${newTagName.trim()}"${commitOid.trim() ? ` at ${commitOid.trim()}` : ' at HEAD'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            await createTag(repo.localPath, newTagName.trim(), commitOid.trim());
            setNewTagName('');
            setCommitOid('');
          },
        },
      ],
    );
  }

  function handleDelete(tagName: string) {
    if (!repo) return;
    Alert.alert(
      'Delete Tag',
      `Are you sure you want to delete tag "${tagName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTag(repo.localPath, tagName);
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

  if (!TAG_OPERATIONS_AVAILABLE) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Tags</Text>
        <View style={styles.unavailable}>
          <Text style={styles.unavailableTitle}>Tags Unavailable</Text>
          <Text style={styles.unavailableText}>
            Tag operations (list, create, delete) are not yet implemented in the native git2-rs module.
            This feature requires additions to expo-git2-rs.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tags</Text>

      {operationLock && (
        <View style={styles.lockBanner}>
          <ActivityIndicator size="small" color="#5b7ef4" />
          <Text style={styles.lockText}>Operation in progress...</Text>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={newTagName}
          onChangeText={setNewTagName}
          placeholder="Tag name"
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, styles.oidInput]}
          value={commitOid}
          onChangeText={setCommitOid}
          placeholder="Commit OID (optional)"
          autoCapitalize="none"
        />
      </View>
      <Button
        title="Create Tag"
        onPress={handleCreateTag}
        disabled={!newTagName.trim() || operationLock}
      />

      {loading ? (
        <ActivityIndicator size="large" color="#5b7ef4" style={styles.loader} />
      ) : (
        <FlatList
          data={tags}
          keyExtractor={(item) => item.name}
          style={styles.list}
          renderItem={({ item }) => (
            <View style={styles.tagRow}>
              <View style={styles.tagInfo}>
                <Text style={styles.tagName}>{item.name}</Text>
                <Text style={styles.oid}>{item.oid?.slice(0, 7) ?? 'unknown'}</Text>
                {item.message && (
                  <Text style={styles.message} numberOfLines={1}>
                    {item.message}
                  </Text>
                )}
              </View>
              <Button
                title="Delete"
                onPress={() => handleDelete(item.name)}
                color="#c00"
              />
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No tags found</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  error: { fontSize: 16, color: '#c00', textAlign: 'center', marginTop: 40 },
  unavailable: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  unavailableTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  unavailableText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
  lockBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f4ff', padding: 8, borderRadius: 4, marginBottom: 12 },
  lockText: { marginLeft: 8, color: '#5b7ef4' },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  oidInput: { flex: 0.7 },
  loader: { marginTop: 40 },
  list: { flex: 1, marginTop: 16 },
  tagRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  tagInfo: { flex: 1 },
  tagName: { fontSize: 16, fontWeight: '500' },
  oid: { fontSize: 12, color: '#999', marginTop: 2 },
  message: { fontSize: 12, color: '#666', marginTop: 4, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
});

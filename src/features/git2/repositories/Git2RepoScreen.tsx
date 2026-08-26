/**
 * Git2RepoScreen — individual repository detail view.
 *
 * GPL-3.0 derivative of GitSync.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useRepoStore } from '../repositories/repoStore';

type Git2RepoRouteProp = RouteProp<{ Git2Repo: { repoId: string } }, 'Git2Repo'>;

export function Git2RepoScreen() {
  const route = useRoute<Git2RepoRouteProp>();
  const { repoId } = route.params;
  const repositories = useRepoStore((s) => s.repositories);
  const repo = repositories.find((r) => r.id === repoId);

  if (!repo) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Repository not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{repo.name}</Text>
      <Text style={styles.label}>Remote</Text>
      <Text style={styles.value}>{repo.remoteUrl}</Text>
      <Text style={styles.label}>Local Path</Text>
      <Text style={styles.value}>{repo.localPath}</Text>
      <Text style={styles.label}>Current Branch</Text>
      <Text style={styles.value}>{repo.currentBranch}</Text>
      <Text style={styles.label}>Default Branch</Text>
      <Text style={styles.value}>{repo.defaultBranch}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  label: { fontSize: 12, color: '#999', marginTop: 12, marginBottom: 4 },
  value: { fontSize: 14, color: '#333' },
  error: { fontSize: 16, color: '#c00', textAlign: 'center', marginTop: 40 },
});

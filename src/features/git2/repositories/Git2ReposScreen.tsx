/**
 * Git2ReposScreen — lists all managed Git repositories.
 *
 * GPL-3.0 derivative of GitSync.
 */

import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useRepoStore } from '../repositories/repoStore';

export function Git2ReposScreen() {
  const repositories = useRepoStore((s) => s.repositories);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Repositories</Text>
      <FlatList
        data={repositories}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.repoName}>{item.name}</Text>
            <Text style={styles.branch}>{item.currentBranch}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No repositories yet</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  repoName: { fontSize: 16, fontWeight: '600' },
  branch: { fontSize: 14, color: '#666' },
  empty: { fontSize: 14, color: '#999', textAlign: 'center', marginTop: 40 },
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { Button, GroupRow, Input, Modal } from '../ui';
import { fetchChildren, TreeNode } from './repoTreeShared';
import { dialogStyles } from './repoTreeStyles';

interface RepoTreeMoveDialogProps {
  visible: boolean;
  node: TreeNode | null;
  owner: string;
  repo: string;
  branch?: string;
  onClose: () => void;
  onMove: (oldPath: string, newPath: string) => void;
}

export function RepoTreeMoveDialog({ visible, node, owner, repo, branch, onClose, onMove }: RepoTreeMoveDialogProps) {
  const { colors } = useTheme();
  const [folders, setFolders] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState('');
  const [customPath, setCustomPath] = useState('');
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (visible && node) {
      setSelectedPath('');
      setCustomPath('');
      setLoading(true);
      fetchChildren(owner, repo, '', branch)
        .then((items) => setFolders(items.filter((item) => item.type === 'dir')))
        .catch(() => setFolders([]))
        .finally(() => setLoading(false));
    }
  }, [branch, node, owner, repo, visible]);

  const handleMove = useCallback(() => {
    if (!node) return;
    const targetFolder = customPath.trim() || selectedPath;
    const newPath = targetFolder ? `${targetFolder}/${node.name}` : node.name;
    if (newPath === node.path) {
      onClose();
      return;
    }
    onMove(node.path, newPath);
    onClose();
  }, [customPath, node, onClose, onMove, selectedPath]);

  if (!node) return null;

  return (
    <Modal visible={visible} onRequestClose={onClose} contentStyle={{ maxHeight: '80%' }}>
      <Text style={[dialogStyles.title, { color: colors.text }]}>Move</Text>
      <Text style={[dialogStyles.subtitle, { color: colors.textSecondary }]}>{node.name}</Text>

      <Text style={[dialogStyles.label, { color: colors.textSecondary }]}>Destination folder</Text>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
      ) : (
        <ScrollView style={dialogStyles.folderList} keyboardShouldPersistTaps="handled">
          <GroupRow
            onPress={() => { setSelectedPath(''); setCustomPath(''); }}
            style={[selectedPath === '' && { backgroundColor: colors.primary + '15' }]}
            leading={<Ionicons name="home-outline" size={16} color={selectedPath === '' ? colors.primary : colors.textSecondary} />}
          >
            <Text style={[dialogStyles.folderItemText, { color: selectedPath === '' ? colors.primary : colors.text }]}>/ (root)</Text>
          </GroupRow>
          {folders.map((folder) => (
            <GroupRow
              key={folder.path}
              testID="repo-tree-move.button.select-path"
              onPress={() => { setSelectedPath(folder.path); setCustomPath(''); }}
              style={[selectedPath === folder.path && { backgroundColor: colors.primary + '15' }]}
              leading={<Ionicons name="folder-outline" size={16} color={selectedPath === folder.path ? colors.primary : '#FF9500'} />}
            >
              <Text style={[dialogStyles.folderItemText, { color: selectedPath === folder.path ? colors.primary : colors.text }]}>{folder.path}</Text>
            </GroupRow>
          ))}
        </ScrollView>
      )}

      <Text style={[dialogStyles.label, { color: colors.textSecondary, marginTop: 8 }]}>Or type a path</Text>
      <Input
        testID="repo-tree-move.input.custom-path"
        ref={inputRef}
        onChangeText={(text) => { setCustomPath(text); if (text) setSelectedPath(''); }}
        placeholder="e.g. notes/archive"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
      />

      <View style={dialogStyles.buttons}>
        <Button testID="repo-tree-move-dialog.button.cancel" variant="secondary" label="Cancel" onPress={onClose} />
        <Button testID="repo-tree-move.button.move" variant="primary" label="Move" onPress={handleMove} disabled={!selectedPath && !customPath.trim()} />
      </View>
    </Modal>
  );
}

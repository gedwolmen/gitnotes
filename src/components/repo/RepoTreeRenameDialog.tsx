import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { Button, Input, Modal } from '../ui';
import { TreeNode } from './repoTreeShared';
import { dialogStyles } from './repoTreeStyles';

interface RepoTreeRenameDialogProps {
  visible: boolean;
  node: TreeNode | null;
  onClose: () => void;
  onRename: (oldPath: string, newName: string) => void;
}

export function RepoTreeRenameDialog({ visible, node, onClose, onRename }: RepoTreeRenameDialogProps) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (visible && node) {
      const baseName = node.type === 'file' ? node.name.replace(/\.[^.]+$/, '') : node.name;
      setName(baseName);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, node]);

  const handleRename = useCallback(() => {
    if (!node || !name.trim()) return;
    let newName = name.trim();
    if (node.type === 'file') {
      const ext = node.name.includes('.') ? `.${node.name.split('.').pop()}` : '';
      if (ext && !newName.endsWith(ext)) {
        newName += ext;
      }
    }
    if (newName === node.name) {
      onClose();
      return;
    }
    onRename(node.path, newName);
    onClose();
  }, [name, node, onClose, onRename]);

  if (!node) return null;

  return (
    <Modal visible={visible} onRequestClose={onClose}>
      <Text style={[dialogStyles.title, { color: colors.text }]}>Rename</Text>
      <Text style={[dialogStyles.subtitle, { color: colors.textSecondary }]}>{node.name}</Text>
      <Input
        ref={inputRef}
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
        autoCorrect={false}
        selectTextOnFocus
        returnKeyType="done"
        onSubmitEditing={handleRename}
      />
      <View style={dialogStyles.buttons}>
        <Button variant="secondary" label="Cancel" onPress={onClose} />
        <Button
          variant="primary"
          label="Rename"
          onPress={handleRename}
          disabled={!name.trim() || name.trim() === (node.type === 'file' ? node.name.replace(/\.[^.]+$/, '') : node.name)}
        />
      </View>
    </Modal>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useNotes } from '../contexts/NoteContext';
import { useTheme } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import MarkdownEditor from '../components/MarkdownEditor';
import GitContextPicker from '../components/GitContextPicker';
import GitHubPicker from '../components/GitHubPicker';
import { HapticService } from '../utils/haptics';
import { Note } from '../models/Note';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;
type NoteEditorRouteProp = RouteProp<RootStackParamList, 'NoteEditor'>;

export default function NoteEditorScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<NoteEditorRouteProp>();
  const { colors } = useTheme();
  const { noteId } = route.params || {};

  const { getNoteById, createNote, updateNote } = useNotes();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [repo, setRepo] = useState<string | undefined>();
  const [branch, setBranch] = useState<string | undefined>();
  const [commit, setCommit] = useState<string | undefined>();
  const [github, setGithub] = useState<Note['github'] | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (noteId) {
      const existingNote = getNoteById(noteId);
      if (existingNote) {
        setTitle(existingNote.title);
        setContent(existingNote.content);
        setRepo(existingNote.repo);
        setBranch(existingNote.branch);
        setCommit(existingNote.commit);
        setGithub(existingNote.github);
      }
    }
  }, [noteId, getNoteById]);

  const handleTitleChange = useCallback((text: string) => {
    setTitle(text);
    setHasChanges(true);
  }, []);

  const handleContentChange = useCallback((text: string) => {
    setContent(text);
    setHasChanges(true);
  }, []);

  const handleRepoChange = useCallback((newRepo: string | undefined) => {
    setRepo(newRepo);
    setBranch(undefined);
    setCommit(undefined);
    setHasChanges(true);
  }, []);

  const handleBranchChange = useCallback((newBranch: string | undefined) => {
    setBranch(newBranch);
    setCommit(undefined);
    setHasChanges(true);
  }, []);

  const handleCommitChange = useCallback((newCommit: string | undefined) => {
    setCommit(newCommit);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim() && !content.trim()) {
      Alert.alert('Empty Note', 'Please add a title or content before saving.');
      return;
    }

    setIsSaving(true);
    try {
      if (noteId) {
        await updateNote({
          id: noteId,
          title: title.trim(),
          content: content.trim(),
          repo,
          branch,
          commit,
          github,
        });
      } else {
        await createNote({
          title: title.trim(),
          content: content.trim(),
          repo,
          branch,
          commit,
          github,
        });
      }
      navigation.goBack();
      HapticService.success();
    } catch (error) {
      HapticService.error();
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [title, content, repo, branch, commit, github, noteId, createNote, updateNote, navigation]);

  const handleCancel = useCallback(() => {
    if (hasChanges && (title.trim() || content.trim())) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } else {
      navigation.goBack();
    }
  }, [hasChanges, title, content, navigation]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.surface }]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleCancel} disabled={isSaving}>
          <Text style={[styles.headerButton, { color: colors.primary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {noteId ? 'Edit Note' : 'New Note'}
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={isSaving}>
          <Text
            style={[
              styles.headerButton,
              styles.saveButton,
              { color: colors.primary },
              isSaving && styles.disabledButton,
            ]}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        <TextInput
          style={[styles.titleInput, { color: colors.text, borderBottomColor: colors.border }]}
          placeholder="Note Title"
          placeholderTextColor={colors.textSecondary}
          value={title}
          onChangeText={handleTitleChange}
          autoFocus={!noteId}
          maxLength={100}
          returnKeyType="next"
        />

        <MarkdownEditor
          content={content}
          onContentChange={handleContentChange}
          placeholder="Start writing your note (supports markdown)..."
        />

        <GitContextPicker
          repo={repo}
          branch={branch}
          commit={commit}
          onRepoChange={handleRepoChange}
          onBranchChange={handleBranchChange}
          onCommitChange={handleCommitChange}
        />

        <GitHubPicker value={github} onChange={setGithub} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerButton: {
    fontSize: 16,
  },
  saveButton: {
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: '600',
    padding: 16,
    borderBottomWidth: 1,
  },
});

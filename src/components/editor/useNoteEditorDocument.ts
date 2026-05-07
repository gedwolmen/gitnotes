import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../../navigation/types';
import { Folder } from '../../models/Folder';
import { Attachment, createAttachment } from '../../models/Attachment';
import { Note, NoteFormat, NoteGitHubLink } from '../../models/Note';
import { CanvasSavePayload } from '../CanvasModal';
import { GitService } from '../../services/GitService';
import { HapticService } from '../../utils/haptics';
import { useUndo } from '../../utils/useUndo';
import { syncNoteToGitHub } from '../../services/NoteGitHubSyncService';
import { NoteSyncQueueService } from '../../services/NoteSyncQueueService';
import { canvasToLink } from '../../models/Canvas';
import { getExtensionForFormat, extractCanvasJsonRefs, slugifyLocal } from './editorShared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;

interface NoteEditorDocumentParams {
  noteId?: string;
  initialFormat?: NoteFormat;
  initialTitle?: string;
  initialContent?: string;
  initialTags?: string[];
  initialRepo?: string;
  initialBranch?: string;
  initialFolderPath?: string;
  activeAccountId?: string | null;
  repositories: { path: string }[];
  folders: Folder[];
  getNoteById: (id: string) => Note | undefined;
  createNote: (...args: any[]) => Promise<any>;
  updateNote: (...args: any[]) => Promise<any>;
  navigation: NavigationProp;
}

export function useNoteEditorDocument({
  noteId,
  initialFormat,
  initialTitle,
  initialContent,
  initialTags,
  initialRepo,
  initialBranch,
  initialFolderPath,
  activeAccountId,
  repositories,
  folders,
  getNoteById,
  createNote,
  updateNote,
  navigation,
}: NoteEditorDocumentParams) {
  const [title, setTitle] = useState(initialTitle ?? '');
  const { state: content, setState: setContent, undo, redo, canUndo, canRedo } = useUndo(initialContent ?? '');
  const [repo, setRepo] = useState<string | undefined>(initialRepo);
  const [branch, setBranch] = useState<string | undefined>(initialBranch);
  const [commit, setCommit] = useState<string | undefined>();
  const [folderPath, setFolderPath] = useState<string | undefined>(initialFolderPath);
  const [, setGithub] = useState<NoteGitHubLink | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>(activeAccountId ?? undefined);
  const [noteFormat, setNoteFormat] = useState<NoteFormat>(initialFormat ?? 'markdown');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isEditing, setIsEditing] = useState(!noteId);
  const [tags, setTags] = useState<string[]>(initialTags ?? []);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [repoFolders, setRepoFolders] = useState<Folder[]>([]);
  const [canvasEditJsonUri, setCanvasEditJsonUri] = useState<string | undefined>(undefined);

  const allFolders = useMemo(() => {
    const merged = new Map<string, Folder>();
    folders.forEach((folder) => merged.set(folder.path, folder));
    repoFolders.forEach((folder) => {
      if (!merged.has(folder.path)) merged.set(folder.path, folder);
    });
    return Array.from(merged.values());
  }, [folders, repoFolders]);

  const selectedFolderId = useMemo(
    () => (folderPath ? allFolders.find((folder) => folder.path === folderPath)?.id ?? null : null),
    [allFolders, folderPath],
  );

  const getNoteByIdRef = useRef(getNoteById);
  useEffect(() => {
    getNoteByIdRef.current = getNoteById;
  }, [getNoteById]);

  useEffect(() => {
    if (!noteId && !repo && repositories.length > 0) {
      setRepo(repositories[0].path);
    }
  }, [noteId, repo, repositories]);

  useEffect(() => {
    if (!repo || branch) return;
    let cancelled = false;

    GitService.getBranches(repo)
      .then((branches) => {
        if (cancelled || branches.length === 0) return;
        const current = branches.find((branchEntry) => branchEntry.isCurrent) ?? branches[0];
        setBranch(current.name);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [repo, branch]);

  useEffect(() => {
    if (!repo) {
      setRepoFolders([]);
      return;
    }

    let cancelled = false;
    GitService.getRepositoryFolders(repo, branch)
      .then((entries) => {
        if (cancelled) return;
        setRepoFolders(
          entries.map((entry) => ({
            id: `repo:${entry.path}`,
            name: entry.name,
            path: `/${entry.path}`,
            parentId: entry.parentPath ? `repo:${entry.parentPath}` : null,
            createdAt: 0,
            updatedAt: 0,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setRepoFolders([]);
      });

    return () => {
      cancelled = true;
    };
  }, [repo, branch]);

  useEffect(() => {
    if (!noteId) return;
    const existingNote = getNoteByIdRef.current(noteId);
    if (!existingNote) return;

    setTitle(existingNote.title);
    setContent(existingNote.content);
    setRepo(existingNote.repo);
    setBranch(existingNote.branch);
    setCommit(existingNote.commit);
    setFolderPath(existingNote.folderPath);
    setGithub(existingNote.github);
    setAccountId(existingNote.accountId ?? activeAccountId ?? undefined);
    setNoteFormat(existingNote.format ?? 'markdown');
    setTags(existingNote.tags || []);
    setAttachments(existingNote.attachments || []);
  }, [noteId, setContent, activeAccountId]);

  const handleTitleChange = useCallback((text: string) => {
    setTitle(text);
    setHasChanges(true);
  }, []);

  const handleContentChange = useCallback((text: string) => {
    setContent(text);
    setHasChanges(true);
  }, [setContent]);

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

  const handleFolderSelect = useCallback((folder: Folder | null) => {
    setFolderPath(folder?.path);
    setHasChanges(true);
  }, []);

  const handleTagsChange = useCallback((newTags: string[]) => {
    setTags(newTags);
    setHasChanges(true);
  }, []);

  const handleNoteFormatChange = useCallback((format: NoteFormat) => {
    setNoteFormat(format);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim() && !content.trim()) {
      Alert.alert('Empty Note', 'Please add a title or content before saving.');
      return;
    }

    if (!repo) {
      Alert.alert('Repository Required', 'Please select a repository before saving.');
      return;
    }

    setIsSaving(true);
    try {
      let savedNoteId = noteId;

      if (noteId) {
        await updateNote({
          id: noteId,
          title: title.trim(),
          content: content.trim(),
          tags,
          repo,
          branch,
          commit,
          folderPath,
          format: noteFormat,
          attachments,
          accountId,
        });
        setHasChanges(false);
        setIsEditing(false);
        HapticService.success();
      } else {
        const newNote = await createNote({
          title: title.trim(),
          content: content.trim(),
          tags,
          repo,
          branch,
          commit,
          folderPath,
          format: noteFormat,
          attachments,
          accountId,
        });
        savedNoteId = newNote?.id;
        HapticService.success();
        navigation.goBack();
      }

      if (repo && content.trim()) {
        const existingForColor = savedNoteId ? getNoteByIdRef.current(savedNoteId) : undefined;
        const syncParams = {
          repo,
          branch,
          filePath: folderPath ? `${folderPath}/${slugifyLocal(title.trim())}${getExtensionForFormat(noteFormat)}` : undefined,
          title: title.trim(),
          content: content.trim(),
          format: noteFormat,
          accountId,
          tags,
          color: existingForColor?.color ?? null,
        };

        const syncResult = await syncNoteToGitHub(syncParams);

        if (syncResult.success && syncResult.filePath && savedNoteId) {
          try {
            await updateNote({
              id: savedNoteId,
              filePath: syncResult.filePath,
              ...(syncResult.finalContent != null && syncResult.finalContent !== content.trim()
                ? { content: syncResult.finalContent }
                : {}),
            });
          } catch (error) {
            void error;
          }
        }

        if (!syncResult.success) {
          console.warn('[NoteEditor] GitHub sync failed, queueing:', syncResult.error);
          await NoteSyncQueueService.enqueueNoteUpsert(syncParams, savedNoteId);
        }
      }
    } catch {
      HapticService.error();
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [title, content, repo, noteId, updateNote, tags, branch, commit, folderPath, noteFormat, attachments, accountId, createNote, navigation]);

  const handleCancelEdit = useCallback(() => {
    if (hasChanges && (title.trim() || content.trim())) {
      Alert.alert('Discard Changes?', 'You have unsaved changes. Are you sure you want to discard them?', [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            if (noteId) {
              const existingNote = getNoteById(noteId);
              if (existingNote) {
                setTitle(existingNote.title);
                setContent(existingNote.content);
                setRepo(existingNote.repo);
                setBranch(existingNote.branch);
                setCommit(existingNote.commit);
                setFolderPath(existingNote.folderPath);
                setNoteFormat(existingNote.format ?? 'markdown');
              }
              setHasChanges(false);
              setIsEditing(false);
            } else {
              navigation.goBack();
            }
          },
        },
      ]);
    } else if (noteId) {
      setIsEditing(false);
    } else {
      navigation.goBack();
    }
  }, [hasChanges, title, content, noteId, getNoteById, setContent, navigation]);

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    HapticService.light();
    undo();
    setHasChanges(true);
  }, [canUndo, undo]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    HapticService.light();
    redo();
    setHasChanges(true);
  }, [canRedo, redo]);

  const handleVoiceDone = useCallback((text: string) => {
    if (text.trim()) {
      setContent(content + (content ? '\n' : '') + text);
      setHasChanges(true);
    }
  }, [content, setContent]);

  const handleCanvasSave = useCallback((payload: CanvasSavePayload) => {
    const pngAttachment = createAttachment({
      uri: payload.uri,
      type: 'image',
      name: payload.name,
      mimeType: 'image/png',
      size: payload.size,
      width: payload.width,
      height: payload.height,
    });
    const jsonAttachment = createAttachment({
      uri: payload.jsonUri,
      type: 'file',
      name: payload.jsonName,
      mimeType: 'application/json',
    });

    if (canvasEditJsonUri) {
      const cleanOldJson = canvasEditJsonUri.split('?')[0];
      const cleanOldPng = cleanOldJson.replace(/\.json$/i, '.png');
      const cacheBustPng = `${payload.uri}?v=${Date.now()}`;
      let next = content;

      if (next.includes(cleanOldPng)) {
        next = next.split(cleanOldPng).join(cacheBustPng);
      } else if (next.includes(cleanOldJson)) {
        next = next.split(cleanOldJson).join(cacheBustPng);
      }

      setContent(next);
    } else {
      setAttachments((previous) => [...previous, pngAttachment, jsonAttachment]);
      setContent(content + `\n![${payload.name}](${payload.uri})\n`);
    }

    setHasChanges(true);
    setCanvasEditJsonUri(undefined);
  }, [canvasEditJsonUri, content, setContent]);

  const handleEditCanvasJson = useCallback((src: string) => {
    const clean = src.split('?')[0];
    setCanvasEditJsonUri(clean.replace(/\.png$/i, '.json'));
  }, []);

  const handleLinkCanvas = useCallback((canvasId: string, canvasTitle: string) => {
    const link = canvasToLink({ id: canvasId });
    const linkText = noteFormat === 'neorg'
      ? `\n{${link}}[${canvasTitle}]\n`
      : noteFormat === 'org'
        ? `\n[[${link}][${canvasTitle}]]\n`
        : `\n[${canvasTitle}](${link})\n`;

    setContent(content + linkText);
    setHasChanges(true);
  }, [content, noteFormat, setContent]);

  const handlePickImage = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to attach images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const newAttachment = createAttachment({
        uri: asset.uri,
        type: 'image',
        name: asset.fileName || `image-${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        width: asset.width,
        height: asset.height,
      });

      setAttachments((previous) => [...previous, newAttachment]);
      setHasChanges(true);
      setContent(content + `\n![${newAttachment.name}](${newAttachment.uri})\n`);
      HapticService.success();
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  }, [content, setContent]);

  const canvasJsonRefs = useMemo(() => extractCanvasJsonRefs(content), [content]);

  const editorPlaceholder = useMemo(() => {
    switch (noteFormat) {
      case 'org':
        return '* My Heading\n** Sub Heading\n- Bullet item\n1. Numbered item\n- [ ] Task item\n- [x] Done item\n\nParagraph text here...';
      case 'neorg':
        return '* Document Heading\n** Sub Heading\n- Bullet item\n~ Numbered item\n( ) Task item\n(x) Done item\n\n```code\n```';
      default:
        return '# Heading\n## Sub Heading\n- Bullet item\n1. Numbered item\n- [ ] Task item\n\nParagraph text here...';
    }
  }, [noteFormat]);

  return {
    title,
    content,
    repo,
    branch,
    commit,
    folderPath,
    noteFormat,
    tags,
    attachments,
    isSaving,
    isEditing,
    canUndo,
    canRedo,
    repoFolders,
    selectedFolderId,
    canvasJsonRefs,
    canvasEditJsonUri,
    editorPlaceholder,
    setIsEditing,
    setCanvasEditJsonUri,
    handleTitleChange,
    handleContentChange,
    handleRepoChange,
    handleBranchChange,
    handleCommitChange,
    handleFolderSelect,
    handleTagsChange,
    handleNoteFormatChange,
    handleSave,
    handleCancelEdit,
    handleUndo,
    handleRedo,
    handleVoiceDone,
    handleCanvasSave,
    handleEditCanvasJson,
    handleLinkCanvas,
    handlePickImage,
  };
}

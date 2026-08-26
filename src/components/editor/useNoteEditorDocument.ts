import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { RootStackParamList } from '../../navigation/types';
import { Folder } from '../../models/Folder';
import { Attachment, createAttachment } from '../../models/Attachment';
import { Note, NoteFormat, NoteGitHubLink } from '../../models/Note';
import { GitService } from '../../services/GitService';
import { LastSelectionPreferenceService } from '../../services/LastSelectionPreferenceService';
import { HapticService } from '../../utils/haptics';
import { useUndo } from '../../utils/useUndo';
import { useNoteStore } from '../../stores/noteStore';
import { githubActivity } from '../../stores/githubActivityStore';
import { canvasToLink } from '../../models/Canvas';
import { getExtensionForFormat, extractCanvasJsonRefs, slugifyLocal } from './editorShared';
import { useHardWrap, applyHardWrap } from '../../hooks/useHardWrap';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;

function normalizeBranch(branch: string | undefined): string {
  return branch || 'main';
}

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
  notes: Note[];
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
  notes,
  getNoteById,
  createNote,
  updateNote,
  navigation,
}: NoteEditorDocumentParams) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle ?? '');
  const { state: content, setState: setContent, undo, redo, canUndo, canRedo } = useUndo(initialContent ?? '');
  const [repo, setRepo] = useState<string | undefined>(initialRepo);
  const [branch, setBranch] = useState<string | undefined>(initialBranch);
  const [commit, setCommit] = useState<string | undefined>();
  const [existingFilePath, setExistingFilePath] = useState<string | undefined>();
  const [folderPath, setFolderPath] = useState<string | undefined>(initialFolderPath);
  const [, setGithub] = useState<NoteGitHubLink | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>(activeAccountId ?? undefined);
  const [noteFormat, setNoteFormat] = useState<NoteFormat>(initialFormat ?? 'markdown');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const contentRef = useRef(content);
  const titleRef = useRef(title);
  contentRef.current = content;
  titleRef.current = title;
  const [isEditing, setIsEditing] = useState(!noteId);
  const [tags, setTags] = useState<string[]>(initialTags ?? []);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [repoFolders, setRepoFolders] = useState<Folder[]>([]);
  const [notFound, setNotFound] = useState(false);
  const { hardWrapEnabled } = useHardWrap();

  useEffect(() => {
    if (noteId) return;
    if (initialRepo || initialBranch || initialFolderPath) return;
    void LastSelectionPreferenceService.get('note').then((sel) => {
      if (!repo && sel.repo) setRepo(sel.repo);
      if (!branch && sel.branch) setBranch(sel.branch);
      if (!folderPath && sel.folder) setFolderPath(sel.folder);
    });
  }, [noteId, initialRepo, initialBranch, initialFolderPath]);

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

  // Guards the notFound effect below against re-copying editor state on
  // unrelated store churn: hydrate once per noteId, then only react to the
  // note actually disappearing.
  const hydratedNoteIdRef = useRef<string | null>(null);

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
      .catch(() => { return; });

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
    if (!noteId) {
      setNotFound(false);
      return;
    }
    const existingNote = getNoteByIdRef.current(noteId);
    if (!existingNote) {
      setNotFound(true);
      return;
    }
    setNotFound(false);
    if (hydratedNoteIdRef.current === noteId) return;
    hydratedNoteIdRef.current = noteId;

    setTitle(existingNote.title);
    setContent(existingNote.content);
    setRepo(existingNote.repo);
    setBranch(existingNote.branch);
    setCommit(existingNote.commit);
    setExistingFilePath(existingNote.filePath);
    setFolderPath(existingNote.folderPath);
    setGithub(existingNote.github);
    setAccountId(existingNote.accountId ?? activeAccountId ?? undefined);
    setNoteFormat(existingNote.format ?? 'markdown');
    setTags(existingNote.tags || []);
    setAttachments(existingNote.attachments || []);
  }, [noteId, setContent, activeAccountId, notes]);

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
    if (repo) {
      void LastSelectionPreferenceService.set('note', { repo, branch, folder: folder?.path });
    }
  }, [repo, branch]);

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

        const syncBlockPath =
      existingFilePath ?? (folderPath ? `${folderPath}/${slugifyLocal(title.trim())}${getExtensionForFormat(noteFormat)}` : undefined);
        const finalContent = applyHardWrap(content.trim(), hardWrapEnabled && noteFormat === 'markdown');
    const contentAtSaveStart = contentRef.current;
    const titleAtSaveStart = titleRef.current;

    setIsSaving(true);
    try {
      let savedNoteId = noteId;

      if (noteId) {
        const updated = await updateNote({
          id: noteId,
          title: title.trim(),
          content: finalContent,
          tags,
          repo,
          branch,
          commit,
          folderPath,
          format: noteFormat,
          attachments,
          accountId,
        });
        if (!updated) {
          HapticService.error();
          Alert.alert('Error', 'Failed to save note locally. Please try again.');
          return;
        }
        HapticService.success();
      } else {
        const newNote = await createNote({
          title: title.trim(),
          content: finalContent,
          tags,
          repo,
          branch,
          commit,
          folderPath,
          format: noteFormat,
          attachments,
          accountId,
        });
        if (!newNote?.id) {
          HapticService.error();
          Alert.alert('Error', 'Failed to save note locally. Please try again.');
          return;
        }
        savedNoteId = newNote.id;
        HapticService.success();
      }

      if (repo && savedNoteId) {
        // Default a brand-new note into `notes/` (matching
        // deriveDefaultNotePath) so the pull reconcile can re-import it after
        // a push + restart. Writing to the repo root (the old fallback) left
        // the file on GitHub but invisible to the notes/ import filter — the
        // note appeared "gone" after restart (data-loss report).
        const defaultSlug = `${slugifyLocal(title.trim())}${getExtensionForFormat(noteFormat)}`;
        const syncPath =
          existingFilePath ??
          (folderPath ? `${folderPath}/${defaultSlug}` : `notes/${defaultSlug}`);
                githubActivity.begin('Pushing note');
        try {
          const existingForColor = getNoteByIdRef.current(savedNoteId);

          const syncResult = await useNoteStore.getState().upsertNote({
            id: savedNoteId,
            repoPath: repo,
            branch: normalizeBranch(branch),
            filePath: syncPath,
            content: finalContent,
            title: title.trim(),
            format: noteFormat,
            accountId,
            tags,
            color: existingForColor?.color ?? null,
          });

          if (!syncResult.success) {
            Alert.alert(
              'Save Failed',
              'Your note was saved locally but could not be synced. Please try again.',
              [{ text: 'OK' }],
            );
          }
        } catch (error) {
          console.warn('[useNoteEditorDocument] note sync threw:', error);
          Alert.alert(
            'Save Failed',
            'Your note was saved locally but could not be synced. Please try again.',
            [{ text: 'OK' }],
          );
        } finally {
          githubActivity.end();
        }
      }

      if (contentRef.current === contentAtSaveStart && titleRef.current === titleAtSaveStart) {
        setHasChanges(false);
        setIsEditing(false);
      }

      if (!noteId) {
        navigation.goBack();
      }
    } catch {
      HapticService.error();
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [title, content, repo, noteId, updateNote, tags, branch, commit, folderPath, noteFormat, attachments, accountId, createNote, navigation, hardWrapEnabled, t]);

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
      const imageRef = noteFormat === 'neorg'
        ? `\n{${newAttachment.uri}}[${newAttachment.name}]\n`
        : noteFormat === 'org'
          ? `\n[[file:${newAttachment.uri}]][${newAttachment.name}]\n`
          : `\n![${newAttachment.name}](${newAttachment.uri})\n`;
      setContent(content + imageRef);
      HapticService.success();
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  }, [content, noteFormat, setContent]);

  const canvasJsonRefs = useMemo(() => extractCanvasJsonRefs(content), [content]);

  const editorPlaceholder = useMemo(() => {
    const linkExamples = `[[wiki-link]] [[wiki-link|Display Text]]
[[../folder/note]] [[folder/sub-note|Sub Note]]
[[tag:research]] [[todo:2024-01-15]]`;
    switch (noteFormat) {
      case 'org':
        return `* My Heading\n** Sub Heading\n- Bullet item\n1. Numbered item\n- [ ] Task item\n- [x] Done item\n\n${linkExamples}\n\nParagraph text here...`;
      case 'neorg':
        return `* Document Heading\n** Sub Heading\n- Bullet item\n~ Numbered item\n( ) Task item\n(x) Done item\n\n${linkExamples}\n\n\`\`\`code\n\`\`\``;
      default:
        return `# Heading\n## Sub Heading\n- Bullet item\n1. Numbered item\n- [ ] Task item\n\n${linkExamples}\n\nParagraph text here...`;
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
    notFound,
    canUndo,
    canRedo,
    repoFolders,
    selectedFolderId,
    canvasJsonRefs,
    editorPlaceholder,
    setIsEditing,
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
    handleLinkCanvas,
    handlePickImage,
  };
}

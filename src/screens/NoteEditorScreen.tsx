import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  NativeScrollEvent,
  NativeSyntheticEvent,
  Linking,
} from 'react-native';

import { Image } from 'expo-image';

import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { useMarkdown, type RendererInterface } from 'react-native-marked';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotes } from '../contexts/NoteContext';
import { useCanvases } from '../contexts/CanvasContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { RootStackParamList } from '../navigation/types';
import MarkdownEditor from '../components/MarkdownEditor';
import GitContextPicker from '../components/GitContextPicker';
import NeorgRenderer from '../components/NeorgRenderer';
import PdfViewer from '../components/PdfViewer';
import TagInput from '../components/TagInput';
import VoiceInputModal from '../components/VoiceInputModal';
import CanvasModal, { CanvasSavePayload } from '../components/CanvasModal';
import CanvasPreview from '../components/CanvasPreview';
import FolderSelectionDialog from '../components/FolderSelectionDialog';
import { useFolders } from '../contexts/FolderContext';
import { useRepos } from '../contexts/RepoContext';
import { Folder } from '../models/Folder';
import { GitService } from '../services/GitService';
import { HapticService } from '../utils/haptics';
import { useUndo } from '../utils/useUndo';
import { NoteFormat, NoteGitHubLink } from '../models/Note';
import { Attachment, createAttachment } from '../models/Attachment';
import { NeorgParser } from '../services/NeorgParser';
import { NeorgContentParser } from '../services/NeorgContentParser';
import { canvasIdFromLink, canvasToLink, isCanvasLink } from '../models/Canvas';
import { useResponsive } from '../hooks/useResponsive';
import { syncNoteToGitHub } from '../services/NoteGitHubSyncService';
import { NoteSyncQueueService } from '../services/NoteSyncQueueService';
import { PositionMemoryService } from '../services/PositionMemoryService';
import { getMarkdownStyles } from '../utils/preview';
import { Button, IconButton, Modal } from '../components/ui';
import { NotePreviewRenderer } from '../utils/markdownRenderer';

interface TocEntry {
  level: number;
  text: string;
  lineIndex: number;
}

const APPROX_LINE_PX = 22;

function extractTocFromMarkdown(content: string): TocEntry[] {
  const out: TocEntry[] = [];
  const lines = content.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) {
      out.push({ level: m[1].length, text: m[2].trim(), lineIndex: i });
    }
  }
  return out;
}

const FORMAT_OPTIONS: { label: string; value: NoteFormat }[] = [
  { label: '.md', value: 'markdown' },
  { label: '.norg', value: 'neorg' },
  { label: '.org', value: 'org' },
];

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;
type NoteEditorRouteProp = RouteProp<RootStackParamList, 'NoteEditor'>;

function slugifyLocal(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled';
}

function getExtensionForFormat(format?: NoteFormat): string {
  switch (format) {
    case 'neorg': return '.norg';
    case 'org': return '.org';
    default: return '.md';
  }
}

function MarkdownBody({ value, styles: mdStyles, renderer }: { value: string; styles: ReturnType<typeof getMarkdownStyles>; renderer?: RendererInterface }) {
  const nodes = useMarkdown(value, { styles: mdStyles, renderer });
  return <>{React.Children.toArray(nodes)}</>;
}

export default function NoteEditorScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<NoteEditorRouteProp>();
  const { colors, isDark } = useTheme();
  const { authState } = useAuth();
  const { sideBySide } = useResponsive();
  const { noteId, format: initialFormat, initialTitle, initialContent, repo: initialRepo, branch: initialBranch, folderPath: initialFolderPath } = route.params || {};

  const { getNoteById, createNote, updateNote } = useNotes();
  const { canvases } = useCanvases();

  const [title, setTitle] = useState(initialTitle ?? '');
  const { state: content, setState: setContent, undo, redo, canUndo, canRedo } = useUndo(initialContent ?? '');
  const [repo, setRepo] = useState<string | undefined>(initialRepo);
  const [branch, setBranch] = useState<string | undefined>(initialBranch);
  const [commit, setCommit] = useState<string | undefined>();
  const [folderPath, setFolderPath] = useState<string | undefined>(initialFolderPath);
  const [github, setGithub] = useState<NoteGitHubLink | undefined>();
  const [noteFormat, setNoteFormat] = useState<NoteFormat>(initialFormat ?? 'markdown');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState<{ uri: string; message: string } | null>(null);

  const [isEditing, setIsEditing] = useState(!noteId);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isPdfNote = noteFormat === 'pdf';

  const [tags, setTags] = useState<string[]>([]);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showCanvasModal, setShowCanvasModal] = useState(false);
  const [canvasEditJsonUri, setCanvasEditJsonUri] = useState<string | undefined>(undefined);
  const [showCanvasPicker, setShowCanvasPicker] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const { folders } = useFolders();
  const { repositories } = useRepos();
  const [repoFolders, setRepoFolders] = useState<Folder[]>([]);

  const allFolders = useMemo(() => {
    const merged = new Map<string, Folder>();
    folders.forEach((f) => merged.set(f.path, f));
    repoFolders.forEach((f) => { if (!merged.has(f.path)) merged.set(f.path, f); });
    return Array.from(merged.values());
  }, [folders, repoFolders]);

  const selectedFolderId = useMemo(
    () => (folderPath ? allFolders.find((f) => f.path === folderPath)?.id ?? null : null),
    [allFolders, folderPath]
  );

  const handleFolderSelect = useCallback((folder: Folder | null) => {
    setFolderPath(folder?.path);
    setHasChanges(true);
  }, []);

  // Auto-default repo to first repository for new notes
  useEffect(() => {
    if (!noteId && !repo && repositories.length > 0) {
      setRepo(repositories[0].path);
    }
  }, [noteId, repo, repositories]);

  // Auto-default branch when repo selected but branch missing
  useEffect(() => {
    if (!repo || branch) return;
    let cancelled = false;
    GitService.getBranches(repo)
      .then((bs) => {
        if (cancelled || bs.length === 0) return;
        const current = bs.find((b) => b.isCurrent) ?? bs[0];
        setBranch(current.name);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [repo, branch]);

  // Fetch folders that exist in the selected repo/branch
  useEffect(() => {
    if (!repo) {
      setRepoFolders([]);
      return;
    }
    let cancelled = false;
    GitService.getRepositoryFolders(repo, branch)
      .then((entries) => {
        if (cancelled) return;
        const mapped: Folder[] = entries.map((e) => ({
          id: `repo:${e.path}`,
          name: e.name,
          path: `/${e.path}`,
          parentId: e.parentPath ? `repo:${e.parentPath}` : null,
          createdAt: 0,
          updatedAt: 0,
        }));
        setRepoFolders(mapped);
      })
      .catch(() => {
        if (!cancelled) setRepoFolders([]);
      });
    return () => { cancelled = true; };
  }, [repo, branch]);

  const resolvePdfUrl = useCallback((value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    const rawGithubMatch = trimmed.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!rawGithubMatch) return trimmed;

    const [, owner, repo, ref, rawPath] = rawGithubMatch;
    const encodedPath = rawPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  }, []);

  // Keep getNoteById in a ref so the load effect below depends only on
  // noteId — otherwise external updates to the notes array (background
  // pulls, other-note edits) re-fire it and clobber unsaved local edits.
  const getNoteByIdRef = useRef(getNoteById);
  useEffect(() => {
    getNoteByIdRef.current = getNoteById;
  }, [getNoteById]);

  useEffect(() => {
    if (noteId) {
      const existingNote = getNoteByIdRef.current(noteId);
      if (existingNote) {
        setTitle(existingNote.title);
        setContent(existingNote.content);
        setRepo(existingNote.repo);
        setBranch(existingNote.branch);
        setCommit(existingNote.commit);
        setFolderPath(existingNote.folderPath);
        setGithub(existingNote.github);
        setNoteFormat(existingNote.format ?? 'markdown');
        setTags(existingNote.tags || []);
        setAttachments(existingNote.attachments || []);
      }
    }
  }, [noteId, setContent]);

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
        });
        savedNoteId = newNote?.id;
        HapticService.success();
        navigation.goBack();
      }

      if (repo && content.trim()) {
        const syncParams = {
          repo,
          branch,
          filePath: folderPath ? `${folderPath}/${slugifyLocal(title.trim())}${getExtensionForFormat(noteFormat)}` : undefined,
          title: title.trim(),
          content: content.trim(),
          format: noteFormat,
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
          } catch {
            // best-effort; pull dedup handles stale state
          }
        }

        if (!syncResult.success) {
          console.warn('[NoteEditor] GitHub sync failed, queueing:', syncResult.error);
          await NoteSyncQueueService.enqueueNoteUpsert(syncParams, savedNoteId);
        }
      }
    } catch (error) {
      HapticService.error();
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [title, content, tags, repo, branch, commit, folderPath, noteFormat, attachments, noteId, createNote, updateNote, navigation]);

  const handleCancelEdit = useCallback(() => {
    if (hasChanges && (title.trim() || content.trim())) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              if (noteId) {
                // Reload original content and go back to preview
                const existingNote = getNoteById(noteId);
                if (existingNote) {
                  setTitle(existingNote.title);
                  setContent(existingNote.content);
                  setRepo(existingNote.repo);
                  setBranch(existingNote.branch);
                  setCommit(existingNote.commit);
                  setFolderPath(existingNote.folderPath);
                  setGithub(existingNote.github);
                  setNoteFormat(existingNote.format ?? 'markdown');
                }
                setHasChanges(false);
                setIsEditing(false);
              } else {
                navigation.goBack();
              }
            },
          },
        ]
      );
    } else if (noteId) {
      setIsEditing(false);
    } else {
      navigation.goBack();
    }
  }, [hasChanges, title, content, noteId, navigation, getNoteById, setContent]);

  const handleUndo = useCallback(() => {
    if (canUndo) {
      HapticService.light();
      undo();
      setHasChanges(true);
    }
  }, [canUndo, undo]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      HapticService.light();
      redo();
      setHasChanges(true);
    }
  }, [canRedo, redo]);

  const handleTagsChange = useCallback((newTags: string[]) => {
    setTags(newTags);
    setHasChanges(true);
  }, []);

  const handleVoiceDone = useCallback((text: string) => {
    if (text.trim()) {
      setContent(content + (content ? '\n' : '') + text);
      setHasChanges(true);
    }
    setShowVoiceModal(false);
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
      setAttachments(prev => [...prev, pngAttachment, jsonAttachment]);
      const linkMarkdown = `\n![${payload.name}](${payload.uri})\n`;
      setContent(content + linkMarkdown);
    }
    setHasChanges(true);
    setShowCanvasModal(false);
    setCanvasEditJsonUri(undefined);
  }, [content, setContent, canvasEditJsonUri]);

  const handleEditCanvasJson = useCallback((src: string) => {
    const clean = src.split('?')[0];
    const jsonUri = clean.replace(/\.png$/i, '.json');
    setCanvasEditJsonUri(jsonUri);
    setShowCanvasModal(true);
  }, []);

  const canvasJsonRefs = useMemo(() => {
    const re = /!\[[^\]]*\]\((file:[^)]+\/canvas-drawings\/canvas-[^)]+\.(?:json|png))\)/g;
    const out: string[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const clean = m[1].split('?')[0].replace(/\.png$/i, '.json');
      if (!seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
      }
    }
    return out;
  }, [content]);

  const handleLinkCanvas = useCallback((canvasId: string, canvasTitle: string) => {
    const link = canvasToLink({ id: canvasId });
    let linkText: string;
    if (noteFormat === 'neorg') {
      linkText = `\n{${link}}[${canvasTitle}]\n`;
    } else if (noteFormat === 'org') {
      linkText = `\n[[${link}][${canvasTitle}]]\n`;
    } else {
      linkText = `\n[${canvasTitle}](${link})\n`;
    }
    setContent(content + linkText);
    setHasChanges(true);
    setShowCanvasPicker(false);
  }, [content, setContent, noteFormat]);

  const handlePickImage = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to attach images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const newAttachment = createAttachment({
          uri: asset.uri,
          type: 'image',
          name: asset.fileName || `image-${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          width: asset.width,
          height: asset.height,
        });
        setAttachments(prev => [...prev, newAttachment]);
        setHasChanges(true);

        const imageMarkdown = `\n![${newAttachment.name}](${newAttachment.uri})\n`;
        setContent(content + imageMarkdown);
        HapticService.success();
      }
    } catch (err) {
      console.error('Image picker error:', err);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  }, [content, setContent]);

  const markdownStyles = useMemo(() => getMarkdownStyles(colors, isDark), [colors, isDark]);


  const previewContent = useMemo(() => {
    const stripTopMetadata = (raw: string, format: NoteFormat): string => {
      if (format === 'markdown') {
        const lines = raw.split('\n');
        if (lines[0]?.trim() !== '---') return raw;
        const closingIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
        if (closingIndex === -1) return raw;
        return lines.slice(closingIndex + 1).join('\n').trimStart();
      }

      if (format === 'org') {
        const lines = raw.split('\n');
        let i = 0;
        while (i < lines.length && /^\s*#\+[A-Za-z0-9_]+:\s*.*$/.test(lines[i])) {
          i += 1;
        }
        while (i < lines.length && lines[i].trim() === '') {
          i += 1;
        }
        return i > 0 ? lines.slice(i).join('\n') : raw;
      }

      if (format === 'neorg') {
        const lines = raw.split('\n');
        if (!lines[0]?.trim().startsWith('@document.meta')) return raw;
        const endIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '@end');
        if (endIndex === -1) return raw;
        return lines.slice(endIndex + 1).join('\n').trimStart();
      }

      return raw;
    };

    if (noteFormat === 'pdf') {
      return content.trim();
    }

    if (noteFormat === 'markdown') {
      return stripTopMetadata(content, 'markdown');
    }

    if (noteFormat === 'neorg') {
      const parsed = NeorgParser.parseDocument(stripTopMetadata(content, 'neorg'));
      if (parsed.success && parsed.document) {
        return parsed.document.content;
      }
      return stripTopMetadata(content, 'neorg');
    }

    return stripTopMetadata(content, 'org');
  }, [content, noteFormat]);

  const pdfViewerUri = useMemo(() => {
    return resolvePdfUrl(previewContent);
  }, [previewContent, resolvePdfUrl]);

  const parsedStructuredContent = useMemo(() => {
    if (noteFormat === 'markdown' || noteFormat === 'pdf') return null;
    const parsed = NeorgContentParser.parseContent(previewContent);
    if (!parsed.success || !parsed.blocks || parsed.blocks.length === 0) return null;
    return parsed.blocks;
  }, [previewContent, noteFormat]);

  const previewScrollRef = useRef<ScrollView>(null);

  const notePreviewRenderer = useMemo(
    () =>
      new NotePreviewRenderer({
        colors,
        navigation,
        previewContent,
        previewScrollRef,
        CanvasPreview,
        approxLinePx: APPROX_LINE_PX,
      }),
    [colors, navigation, previewContent],
  );

  const speakableContent = useMemo(() => {
    return previewContent
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[*_~]{1,2}([^*_~]+)[*_~]{1,2}/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\n{2,}/g, '. ')
      .trim();
  }, [previewContent]);

  const isSpeakingRef = useRef(false);

  const handleToggleSpeak = useCallback(async () => {
    if (isSpeaking) {
      await Speech.stop();
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      return;
    }
    if (!speakableContent) return;
    HapticService.light();
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    Speech.speak(speakableContent, {
      onDone: () => { isSpeakingRef.current = false; setIsSpeaking(false); },
      onStopped: () => { isSpeakingRef.current = false; setIsSpeaking(false); },
      onError: () => { isSpeakingRef.current = false; setIsSpeaking(false); },
    });
  }, [isSpeaking, speakableContent]);

  useEffect(() => {
    return () => {
      // Only stop if this screen instance was the one speaking. Otherwise
      // unmounting one editor would silence speech started by another.
      if (isSpeakingRef.current) {
        Speech.stop();
      }
    };
  }, []);

  const [showToc, setShowToc] = useState(false);

  const tocEntries = useMemo(() => {
    if (noteFormat !== 'markdown') return [];
    return extractTocFromMarkdown(previewContent);
  }, [previewContent, noteFormat]);

  const handleTocPress = useCallback((entry: TocEntry) => {
    setShowToc(false);
    const y = entry.lineIndex * APPROX_LINE_PX;
    requestAnimationFrame(() => {
      previewScrollRef.current?.scrollTo({ y, animated: true });
    });
  }, []);
  const targetScrollYRef = useRef<number | null>(null);
  const restoredScrollRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const saveScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    PositionMemoryService.load(PositionMemoryService.noteKey(noteId)).then((y) => {
      if (!cancelled) targetScrollYRef.current = y ?? 0;
    });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    return () => {
      if (saveScrollTimeoutRef.current) clearTimeout(saveScrollTimeoutRef.current);
      if (noteId && lastScrollYRef.current > 0) {
        PositionMemoryService.save(PositionMemoryService.noteKey(noteId), lastScrollYRef.current);
      }
    };
  }, [noteId]);

  const handlePreviewScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      lastScrollYRef.current = y;
      if (!noteId) return;
      if (saveScrollTimeoutRef.current) clearTimeout(saveScrollTimeoutRef.current);
      saveScrollTimeoutRef.current = setTimeout(() => {
        PositionMemoryService.save(PositionMemoryService.noteKey(noteId), y);
      }, 400);
    },
    [noteId],
  );

  const handlePreviewContentSizeChange = useCallback(() => {
    if (restoredScrollRef.current) return;
    const target = targetScrollYRef.current;
    if (target == null) return;
    if (target > 0) {
      previewScrollRef.current?.scrollTo({ y: target, animated: false });
    }
    restoredScrollRef.current = true;
  }, []);

  const editorPlaceholder = (() => {
    switch (noteFormat) {
      case 'org':
        return '* My Heading\n** Sub Heading\n- Bullet item\n1. Numbered item\n- [ ] TODO item\n- [x] Done item\n\nParagraph text here...';
      case 'neorg':
        return '* Document Heading\n** Sub Heading\n- Bullet item\n~ Numbered item\n( ) TODO item\n(x) Done item\n\n```code\n```';
      default:
        return '# Heading\n## Sub Heading\n- Bullet item\n1. Numbered item\n- [ ] TODO item\n\nParagraph text here...';
    }
  })();

  // ── PREVIEW MODE ──────────────────────────────────────────────
  if (!isEditing) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface, gap: 8 }]}>
          <IconButton size="sm" onPress={() => navigation.goBack()} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={20} color={colors.accent} />
          </IconButton>
          <View style={styles.flex} />
          {!isPdfNote && tocEntries.length > 0 ? (
            <IconButton size="sm" onPress={() => { HapticService.light(); setShowToc(true); }} accessibilityLabel="Table of contents">
              <Ionicons name="list" size={18} color={colors.accent} />
            </IconButton>
          ) : null}
          {!isPdfNote && speakableContent ? (
            <IconButton size="sm" onPress={handleToggleSpeak} accessibilityLabel="Read aloud">
              <Ionicons
                name={isSpeaking ? 'stop-circle' : 'volume-high'}
                size={18}
                color={colors.accent}
              />
            </IconButton>
          ) : null}
          {!isPdfNote && (
            <IconButton
              size="sm"
              onPress={() => { HapticService.light(); setIsEditing(true); }}
              accessibilityLabel="Edit"
            >
              <Ionicons name="pencil" size={18} color={colors.accent} />
            </IconButton>
          )}
        </View>

        {noteFormat === 'pdf' ? (
          <View style={styles.pdfFullScreenContainer}>
            {previewContent.trim() ? (
              pdfViewerUri ? (
                <PdfViewer
                  uri={pdfViewerUri}
                  token={authState.token}
                  style={styles.pdfViewer}
                  onError={(message) => setPdfLoadError({ uri: pdfViewerUri, message })}
                />
              ) : (
                <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}>No PDF URL available for this note.</Text>
              )
            ) : (
              <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}>No PDF URL available for this note.</Text>
            )}
            {pdfLoadError && pdfViewerUri && pdfLoadError.uri === pdfViewerUri ? (
              <Text style={[styles.pdfErrorText, { color: colors.error }]}>Failed to load PDF: {pdfLoadError.message}</Text>
            ) : null}
          </View>
        ) : (
          <ScrollView
            ref={previewScrollRef}
            style={styles.scrollView}
            contentContainerStyle={styles.previewContent}
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="automatic"
            onScroll={handlePreviewScroll}
            scrollEventThrottle={200}
            onContentSizeChange={handlePreviewContentSizeChange}
          >
            {previewContent.trim() ? (
              noteFormat === 'markdown' ? (
                <MarkdownBody value={previewContent} styles={markdownStyles} renderer={notePreviewRenderer} />
              ) : parsedStructuredContent ? (
                <NeorgRenderer blocks={parsedStructuredContent} />
              ) : (
                <Text style={[styles.structuredFallback, { color: colors.text }]}>{previewContent}</Text>
              )
            ) : (
              <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}> 
                No content — tap the pencil to start writing.
              </Text>
            )}
          </ScrollView>
        )}
        <Modal visible={showToc} onRequestClose={() => setShowToc(false)} fullWidth>
          <Text style={[styles.tocTitle, { color: colors.text }]}>Table of contents</Text>
          {tocEntries.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>No headings in this note.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }}>
              {tocEntries.map((entry, idx) => (
                <TouchableOpacity
                  key={`${entry.lineIndex}-${idx}`}
                  onPress={() => handleTocPress(entry)}
                  style={[styles.tocRow, { paddingLeft: 8 + (entry.level - 1) * 14 }]}
                >
                  <Text
                    style={[
                      styles.tocText,
                      {
                        color: colors.text,
                        fontWeight: entry.level <= 2 ? '600' : '400',
                        fontSize: entry.level === 1 ? 16 : 14,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {entry.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity onPress={() => setShowToc(false)} style={styles.tocClose}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Close</Text>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── EDIT MODE ─────────────────────────────────────────────────
  const editorColumn = (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.editorContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.gitContextContainer}>
        <GitContextPicker
          repo={repo}
          branch={branch}
          commit={commit}
          onRepoChange={handleRepoChange}
          onBranchChange={handleBranchChange}
          onCommitChange={handleCommitChange}
        />
      </View>

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

      <TouchableOpacity
        style={[styles.folderSelector, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
        onPress={() => { HapticService.light(); setShowFolderDialog(true); }}
        activeOpacity={0.7}
      >
        <Ionicons
          name="folder-outline"
          size={18}
          color={folderPath ? colors.primary : colors.textSecondary}
        />
        <Text style={[styles.folderSelectorLabel, { color: colors.textSecondary }]}>Folder</Text>
        <Text
          style={[
            styles.folderSelectorText,
            { color: folderPath ? colors.text : colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {folderPath || 'None'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Format selector */}
      <View style={[styles.formatRow, { borderBottomColor: colors.border }]}>
        <Ionicons name="document-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.formatRowLabel, { color: colors.textSecondary }]}>Format</Text>
        <View style={styles.formatOptions}>
          {FORMAT_OPTIONS.map(({ label, value }) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.formatChip,
                { borderColor: colors.border },
                noteFormat === value && { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
              ]}
              onPress={() => { setNoteFormat(value); setHasChanges(true); HapticService.selection(); }}
            >
              <Text style={[styles.formatChipText, { color: noteFormat === value ? colors.primary : colors.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TagInput tags={tags} onTagsChange={handleTagsChange} />

      {canvasJsonRefs.length > 0 && (
        <View style={styles.canvasChipsRow}>
          <Text style={[styles.canvasChipsLabel, { color: colors.textSecondary }]}>Canvases</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.canvasChipsScroll}>
            {canvasJsonRefs.map((uri, i) => {
              return (
                <TouchableOpacity
                  key={uri}
                  style={[styles.canvasChip, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                  onPress={() => handleEditCanvasJson(uri)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="brush-outline" size={14} color={colors.primary} />
                  <Text style={[styles.canvasChipText, { color: colors.text }]} numberOfLines={1}>
                    {`Canvas ${i + 1}`}
                  </Text>
                  <Ionicons name="pencil" size={12} color={colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <MarkdownEditor
        content={content}
        onContentChange={handleContentChange}
        placeholder={editorPlaceholder}
      />
    </ScrollView>
  );

  const livePreview = noteFormat === 'pdf' ? null : (
    <ScrollView
      style={[styles.scrollView, { borderLeftColor: colors.border, borderLeftWidth: StyleSheet.hairlineWidth }]}
      contentContainerStyle={styles.previewContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.livePreviewLabel, { color: colors.textSecondary }]}>Preview</Text>
      {previewContent.trim() ? (
        noteFormat === 'markdown' ? (
          <MarkdownBody value={previewContent} styles={markdownStyles} renderer={notePreviewRenderer} />
        ) : parsedStructuredContent ? (
          <NeorgRenderer blocks={parsedStructuredContent} />
        ) : (
          <Text style={[styles.structuredFallback, { color: colors.text }]}>{previewContent}</Text>
        )
      ) : (
        <Text style={[styles.emptyPreview, { color: colors.textSecondary }]}>
          Start writing to see a preview...
        </Text>
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: colors.surface }]}>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.headerLeft}>
          <Button variant="ghost" label="Cancel" onPress={handleCancelEdit} disabled={isSaving} textStyle={styles.headerButtonText} />
        </View>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {noteId ? 'Edit Note' : 'New Note'}
        </Text>
        <View style={styles.headerRight}>
          <Button
            variant="ghost"
            label={isSaving ? 'Saving…' : 'Save'}
            onPress={handleSave}
            disabled={isSaving}
            textStyle={[styles.headerButtonText, styles.saveButtonText, isSaving && styles.disabledButton]}
          />
        </View>
      </View>

      <View style={[styles.toolbar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        {(canUndo || canRedo) && (
          <>
            <IconButton size="sm" onPress={handleUndo} disabled={!canUndo} accessibilityLabel="Undo">
              <Ionicons name="arrow-undo" size={20} color={canUndo ? colors.primary : colors.textSecondary} />
            </IconButton>
            <IconButton size="sm" onPress={handleRedo} disabled={!canRedo} accessibilityLabel="Redo">
              <Ionicons name="arrow-redo" size={20} color={canRedo ? colors.primary : colors.textSecondary} />
            </IconButton>
            <View style={{ width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 }} />
          </>
        )}
        <IconButton size="sm" onPress={() => setShowVoiceModal(true)} accessibilityLabel="Voice input">
          <Ionicons name="mic-outline" size={20} color={colors.primary} />
        </IconButton>
        <IconButton size="sm" onPress={() => setShowCanvasModal(true)} accessibilityLabel="Insert canvas">
          <Ionicons name="brush-outline" size={20} color={colors.primary} />
        </IconButton>
        <IconButton size="sm" onPress={handlePickImage} accessibilityLabel="Insert image">
          <Ionicons name="image-outline" size={20} color={colors.primary} />
        </IconButton>
        <IconButton size="sm" onPress={() => setShowCanvasPicker(true)} accessibilityLabel="Link existing canvas">
          <Ionicons name="easel-outline" size={20} color={colors.primary} />
        </IconButton>
      </View>

      {sideBySide ? (
        <View style={styles.sideBySideContainer}>
          <View style={styles.sideBySideEditor}>
            {editorColumn}
          </View>
          <View style={styles.sideBySidePreview}>
            {livePreview}
          </View>
        </View>
      ) : (
        editorColumn
      )}
    </KeyboardAvoidingView>

    <VoiceInputModal
      visible={showVoiceModal}
      onDone={handleVoiceDone}
      onClose={() => setShowVoiceModal(false)}
    />

    <CanvasModal
      visible={showCanvasModal}
      onSave={handleCanvasSave}
      onClose={() => {
        setShowCanvasModal(false);
        setCanvasEditJsonUri(undefined);
      }}
      editJsonUri={canvasEditJsonUri}
    />

    <CanvasPickerModal
      visible={showCanvasPicker}
      canvases={canvases}
      onSelect={handleLinkCanvas}
      onClose={() => setShowCanvasPicker(false)}
    />

    <FolderSelectionDialog
      visible={showFolderDialog}
      selectedFolderId={selectedFolderId}
      onSelect={handleFolderSelect}
      onClose={() => setShowFolderDialog(false)}
      additionalFolders={repoFolders}
    />
    </SafeAreaView>
  );
}

import { Modal as RNModal, FlatList } from 'react-native';
import { Canvas } from '../models/Canvas';

interface CanvasPickerProps {
  visible: boolean;
  canvases: Canvas[];
  onSelect: (canvasId: string, canvasTitle: string) => void;
  onClose: () => void;
}

function CanvasPickerModal({ visible, canvases, onSelect, onClose }: CanvasPickerProps) {
  const { colors } = useTheme();

  const renderItem = ({ item }: { item: Canvas }) => (
    <TouchableOpacity
      style={[canvasPickerStyles.item, { borderBottomColor: colors.border }]}
      onPress={() => onSelect(item.id, item.title)}
    >
      <Ionicons name="easel-outline" size={18} color={colors.primary} />
      <View style={canvasPickerStyles.itemContent}>
        <Text style={[canvasPickerStyles.itemTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[canvasPickerStyles.itemMeta, { color: colors.textSecondary }]}>
          {item.scene?.elements?.length ?? 0} elements
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <RNModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={[canvasPickerStyles.container, { backgroundColor: colors.background }]}>
        <View style={canvasPickerStyles.header}>
          <TouchableOpacity onPress={onClose} style={canvasPickerStyles.closeBtn}>
            <Text style={[canvasPickerStyles.closeText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[canvasPickerStyles.title, { color: colors.text }]}>Link Canvas</Text>
          <View style={canvasPickerStyles.closeBtn} />
        </View>
        <FlatList
          data={canvases}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={canvasPickerStyles.empty}>
              <Text style={[canvasPickerStyles.emptyText, { color: colors.textSecondary }]}>
                No canvases yet. Create one from the Canvases tab first.
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </RNModal>
  );
}

const canvasPickerStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3a3a3c',
  },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  closeText: { fontSize: 16 },
  title: { fontSize: 17, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '500' },
  itemMeta: { fontSize: 13, marginTop: 2 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
  },
  iconButton: {
    padding: 8,
  },
  headerTextButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 50,
  },
  headerButtonText: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  saveButtonText: {
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  toolbarButton: {
    padding: 8,
    borderRadius: 8,
  },
  scrollView: {
    flex: 1,
  },
  editorContent: {
    paddingBottom: 120,
  },
  // Preview mode
  previewContent: {
    padding: 20,
    paddingTop: 28,
    paddingBottom: 60,
  },
  previewTitle: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 16,
    lineHeight: 32,
  },
  emptyPreview: {
    fontSize: 16,
    fontStyle: 'italic',
    marginTop: 8,
  },
  tocTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  tocRow: { paddingVertical: 8 },
  tocText: { fontSize: 14 },
  tocClose: { paddingTop: 12, alignItems: 'flex-end' },
  structuredFallback: {
    fontSize: 16,
    lineHeight: 24,
  },
  pdfFullScreenContainer: {
    flex: 1,
  },
  pdfViewer: {
    flex: 1,
    width: '100%',
  },
  pdfErrorText: {
    fontSize: 13,
    marginTop: 8,
    marginHorizontal: 12,
    textAlign: 'center',
  },
  // Edit mode
  titleInput: {
    fontSize: 24,
    fontWeight: '600',
    padding: 16,
    borderBottomWidth: 1,
  },
  folderSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  folderSelectorLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  folderSelectorText: {
    flex: 1,
    fontSize: 15,
    textAlign: 'right',
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  formatRowLabel: {
    fontSize: 14,
    marginRight: 4,
  },
  formatOptions: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  formatChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  formatChipText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  gitContextContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  livePreviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  sideBySideContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  sideBySideEditor: {
    flex: 1,
  },
  sideBySidePreview: {
    flex: 1,
  },
  canvasChipsRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  canvasChipsLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  canvasChipsScroll: {
    gap: 8,
    paddingRight: 16,
  },
  canvasChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  canvasChipText: {
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 120,
  },
});
